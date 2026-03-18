

## Diagnosis

### Root cause confirmed

The edge function **works** — logs at 13:40 show `GCS fallback succeeded` for bare signature paths. The remaining failure is one of two issues:

1. **Auth token expiry**: Console shows `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` at 13:46. When the session expires, `resolveSignatureUrlViaEdge` gets no token (line 48) and returns `null`. Every signature slot becomes null → "Not signed" display.

2. **Upload destination mismatch**: When `CLOUD_STORAGE_ENABLED` is true, `gcsStorageService` uploads signatures to GCS bucket `axentra_db` with UUID filenames (e.g. `jobs/.../signatures/.../uuid-timestamp.png`). The GCS upload edge function returns the **bare path** as the URL (line 151 of `gcs-upload`). This bare path is stored in DB. On resolution, the `resolve-signature-url` edge function tries Supabase bucket `vehicle-signatures` first (always fails for GCS-uploaded files), then falls back to GCS V4 signing. This fallback works but adds latency and fragility.

3. **Screenshot analysis**: Pickup slots show bordered boxes with no visible image (the `<img>` tag is rendered but content is invisible). This means either: (a) the GCS signed URL loads but the PNG has a transparent/white background making the signature invisible against the white card, OR (b) the resolution returned null and we see the fallback state, OR (c) an `onError` fired and we're seeing "Couldn't load" without the icon rendering properly.

### Architecture problem

The `internalStorageService.uploadImage` for signatures returns `supabase-sig://` URIs. The `gcsStorageService.uploadImage` returns bare paths. Both go through the same `storageService` proxy based on `CLOUD_STORAGE_ENABLED`. The edge function must handle both — it does, but Supabase signing always fails for GCS-uploaded objects, adding unnecessary round-trips.

### Dead code

`internalStorageService.resolveSignatureUrlStructured()` and `resolveSignatureUrl()` are no longer called in any active path. They're dead code creating confusion.

---

## Plan

### A. Fix auth resilience in `resolveSignatureUrlViaEdge.ts`

Replace `supabase.auth.getSession()` with a pattern that attempts token refresh on failure. If refresh fails, log explicitly and return null. This prevents silent failures when the refresh token is stale.

### B. Remove dead signature resolution from `internalStorageService.ts`

Delete `resolveSignatureUrlStructured()` and `resolveSignatureUrl()` methods and the `SignatureResolveResult` interface. These are no longer called anywhere and create confusion about which path is active.

### C. Add signature background contrast in `PodReport.tsx` SignatureCard

Change the `<img>` container from `bg-white` to a light gray background (`bg-slate-50`) so signatures drawn on transparent canvases are visible. This is a likely contributor to the "empty box" appearance.

### D. Harden PodReport resolution effect

- After resolution, validate each slot: reject any value that isn't a string starting with `https://`
- Add explicit logging for the auth-failure case so it's distinguishable from resolution failure
- Ensure `onError` in `SignatureCard` logs the full HTTP status if possible

### E. Verify edge function GCS fallback path encoding

The V4 signing uses `objectPath.split("/").map(encodeURIComponent).join("/")` for the canonical URI. Verify this matches how `gcs-upload` stores the object (with UUID-timestamp filenames that may contain special characters). No code change expected, just validation.

### F. Consumer consistency check

- `podPdf.ts`: Already uses `resolveSignatureUrlViaEdge` ✓
- `mediaResolver.ts`: Already routes through edge function ✓  
- `internalStorageService`: Dead code to be removed (step B)
- No other active signature consumers found

---

### Files to change

1. `src/lib/resolveSignatureUrlViaEdge.ts` — auth resilience
2. `src/lib/internalStorageService.ts` — remove dead signature resolution methods
3. `src/pages/PodReport.tsx` — signature card contrast fix + logging hardening

