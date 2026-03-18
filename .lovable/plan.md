
1) Root cause (proven)

- Exact failing layer: `src/lib/mediaResolver.ts` bare signature-path branch.
- Exact category: **B (bucket mismatch) leading to D (object not found)**.
- Why: current code forces `jobs/<id>/signatures/...` bare values to Supabase signing only (`vehicle-signatures`) and returns `null` on failure.
- Evidence from DB:
  - 17 signature URLs are stored as bare `jobs/.../signatures/...` paths.
  - For those 17 paths, `storage.objects` has **no matching object** in `vehicle-signatures`.
  - So these records are GCS-backed historical/current variants, not Supabase bucket objects.
- Impact scope: subset of records (all bare-path signatures), while legacy `vehicle-signatures` URLs can still resolve.

2) Minimal implementation plan

A. `src/lib/mediaResolver.ts` (primary fix)
- Keep “bare signature path => try Supabase first” logic.
- Reintroduce strict fallback:
  - If `resolveSignatureUrlStructured(...)` returns `OBJECT_NOT_FOUND`, immediately try `resolveGcsViaAuthenticatedFetch(path)`.
  - Return GCS URL if resolved.
  - If fallback fails, log explicit dual-failure reason and return `null`.
- Do not fallback on malformed/permission errors (log and return null).

B. `src/lib/internalStorageService.ts` (stability refinement)
- Keep structured resolver API.
- Tighten error classification to include status code and common “resource not found” variants so fallback triggers reliably.
- Preserve explicit logs for: raw input, format, bucket, path, `createSignedUrl` result, error payload.

C. `src/pages/PodReport.tsx` (observability hardening)
- Keep current slot-level logging.
- Add per-slot `try/catch` around `resolveMediaUrlAsync(raw)` so one thrown resolution does not abort all signature slots.
- Keep `SignatureCard` load telemetry (`render`, `onLoad`, `onError`) and ensure raw/non-https values never reach `<img src>`.

D. `src/hooks/usePodReviewData.ts`
- No behavior change required (already uses persisted DB signature fields).
- Keep as-is; include regression check only.

3) Validation plan (must pass)

- Test one bare-path job (e.g. `e5248afd-...`) and one legacy Supabase-signature job.
- Verify all 4 slots:
  - pickup_driver
  - pickup_customer
  - delivery_driver
  - delivery_customer
- Confirm logs show:
  - bare path => Supabase `OBJECT_NOT_FOUND` => GCS fallback => final HTTPS URL => image `onLoad`.
  - legacy Supabase path => direct signed URL => image `onLoad`.
- Confirm:
  - no raw `jobs/...` or `supabase-sig://` values used in `<img src>`
  - no silent nulls (every null has explicit reason)
  - “Awaiting review” still computed from persisted signature DB fields, not image load outcomes.

4) Architecture decision

- **Retain client-side resolution** with hybrid fallback (Supabase sign first, GCS fallback on OBJECT_NOT_FOUND).
- No new Edge Function needed; existing `gcs-proxy` path remains the fallback transport.
- This is the smallest correct fix limited strictly to signature resolution/rendering.
