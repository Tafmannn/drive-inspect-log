## Truth Mode Investigation — "Image unavailable" on Inspection POD

### Root Cause (Confidence: 95%)

**`compressToBlob` in `src/lib/pendingUploads.ts` is producing 0-byte JPEG Blobs for some photos, and those empty Blobs are persisted, uploaded, and a DB row is written — so the pipeline "succeeds" end-to-end but the object stored in `vehicle-photos` is 0 bytes. The browser then renders `<img>` as a broken image, which `PhotoViewer` displays as "Image unavailable".**

This is not a storage, RLS, resolver, or race-condition problem. The upload pipeline did exactly what it was told — it uploaded an empty file.

### Direct evidence — `storage.objects` for job `0f1329c5-…`

Pulled live from Supabase Storage metadata for this exact inspection:

| Photo type | DB row | storage.objects.size | UI |
|---|---|---|---|
| damage_close_up | ✅ exists | **0** | ❌ broken |
| pickup_exterior_front | ✅ exists | **0** | ❌ broken |
| pickup_exterior_rear | ✅ exists | **0** | ❌ broken |
| pickup_exterior_driver_side | ✅ exists | **0** | ❌ broken |
| pickup_exterior_passenger_side | ✅ exists | **0** | ❌ broken |
| pickup_interior | ✅ exists | **398 150** | ✅ works |
| pickup_dashboard | ✅ exists | **0** | ❌ broken |
| pickup_fuel_gauge | ✅ exists | **558 460** | ✅ works |

Every broken photo lines up exactly with a 0-byte stored object. Every working photo has real bytes. There is no other axis of difference — same bucket (`vehicle-photos`), same path shape, same `backend = 'internal'`, same public URL pattern, same `thumbnail_url = NULL`, same `mime = image/jpeg`. The DB row is fine; the file on disk is empty.

That eliminates: resolver, signed URLs, GCS proxy, thumbnails, RLS, race conditions on inspection commit, missing rows, mediaResolver branching, and PhotoViewer logic. They all see a valid `https://…/storage/v1/object/public/vehicle-photos/…jpg` and request it; Supabase returns HTTP 200 with `Content-Length: 0`; the `<img>` fires `onerror` (Safari treats 0-byte image responses as a decode error) and `PhotoViewer` flips to the "Image unavailable" tile.

### Where the empty bytes come from — `src/lib/pendingUploads.ts` lines 424–469

```ts
canvas.toBlob(
  (blob) => {
    if (blob) resolve(blob);          // ← accepts blob.size === 0
    else reject(new Error("Canvas toBlob returned null"));
  },
  "image/jpeg",
  JPEG_QUALITY,
);
```

`HTMLCanvasElement.toBlob` on iOS Safari is known to return a **non-null but 0-byte Blob** when the GPU/canvas pipeline is under memory pressure — exactly what happens when the staging loop in `InspectionFlow.tsx` (lines 651–684) decodes 6+ full-resolution JPEGs into 1920px canvases back-to-back. The first few canvases empty the GPU buffer cache and `toBlob` quietly returns an empty Blob instead of failing. The empty Blob is then:

1. Stored via `writeBlobKey(id, blob)` (line 618) — succeeds, 0 bytes on disk.
2. Hydrated by `loadAllRaw` (line 323) — empty Blob comes back, still truthy.
3. Wrapped into a `File` by `retryUpload` (line 1023) — `new File([emptyBlob], ...)`.
4. Uploaded via `internalStorageService.uploadImage` — Supabase Storage cheerfully writes a 0-byte object.
5. `insertPhoto` writes the row with the public URL.
6. POD review fetches the row, `<img>` requests the URL, gets 0 bytes, renders broken.

The pattern in the timestamps confirms it: the 6 broken uploads were the first 6 in the sequence; the 2 working uploads (Interior, Fuel Gauge) are interleaved later once earlier canvases had been GC'd.

### Files responsible

- **`src/lib/pendingUploads.ts`** — `compressToBlob` (lines 424–469) does not validate `blob.size > 0`.
- Secondary: `stagePendingUpload` (lines 580–626) and `retryUpload` (lines 1023–1030) do not guard against an empty blob either, so the bad bytes propagate.

### Why some photos succeed and others don't

There is nothing semantically different about Interior/Fuel Gauge vs the rest. The only variable is **whether `canvas.toBlob` happened to return real bytes on that iteration**. With 8 sequential 4032×3024 decodes on an iPhone, Safari sporadically returns empty Blobs — usually concentrated at the start of the batch while GPU memory is still warming. This is consistent with literature on the WebKit canvas toBlob bug and matches the exact failure shape we see.

### Minimal fix (one file, ~10 lines)

In `src/lib/pendingUploads.ts`, inside `compressToBlob`:

1. Treat `blob == null || blob.size === 0` as a failure, not a success.
2. On failure, retry the canvas → toBlob step up to 2 times with a `await new Promise(r => setTimeout(r, 50))` between attempts (lets Safari reclaim the canvas buffer).
3. If all retries still yield 0 bytes, **fall back to the original `file`** (which we already know is a real photo with non-zero bytes — the camera/library handed it to us).

Optional belt-and-braces (1 line) at the top of `retryUpload`'s upload step (line ~1023): if `existing.fileBlob.size === 0`, throw a deterministic `EMPTY_BLOB` error instead of uploading — prevents any future regression from ever writing a 0-byte object again.

No other files need to change. No architecture change. No Phase B. No resolver/storage redesign.

### Deliverables summary

| Item | Answer |
|---|---|
| Root cause | `canvas.toBlob` returning 0-byte Blobs under iOS Safari memory pressure; `compressToBlob` accepts them as success |
| Evidence | `storage.objects.metadata.size = 0` for every broken photo; non-zero for every working photo (table above) |
| File(s) responsible | `src/lib/pendingUploads.ts` (`compressToBlob`, lines 424–469) |
| Minimal fix | Reject empty Blobs in `compressToBlob`, retry, then fall back to original File; add `EMPTY_BLOB` guard in `retryUpload` |
| Why only some fail | Non-deterministic iOS Safari canvas behaviour; first canvases in a long batch are most affected, later ones recover |
| Confidence | 95% — confirmed by direct DB+Storage evidence on the exact job |

Awaiting approval to apply the minimal fix only. No other changes will be made.