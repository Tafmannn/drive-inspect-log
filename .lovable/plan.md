
Do I know what the issue is? Yes.

Root cause (proven):
- Failing layer: signature resolver routing in `src/lib/mediaResolver.ts`.
- Error category: **B (bucket mismatch)** causing **D (object not found)**.
- Scope: affects a **subset** — newer signatures stored as bare paths in GCS (`jobs/.../signatures/.../<uuid>-<ts>.png`), not legacy Supabase `vehicle-signatures` objects.
- Why: current logic treats bare `jobs/.../signatures/...` as Supabase bucket paths and calls `createSignedUrl` on `vehicle-signatures`, which logs `Object not found`.

Evidence already captured:
- Console: `[SignatureResolve] createSignedUrl failed ... bucket: vehicle-signatures ... error: Object not found`.
- DB: failing inspection stores bare paths for signatures; those exact paths do **not** exist in `storage.objects`.
- Storage truth: legacy signatures exist in `vehicle-signatures` as `jobs/{jobId}/signatures/{type}/driver.png|customer.png`; newer rows use randomized filenames consistent with `gcs-upload`.
- Feature flag: `CLOUD_STORAGE_ENABLED=true`, so recent signature uploads are going to GCS.

Smallest correct fix (no UI redesign):
1) `src/lib/internalStorageService.ts`
- Add a diagnostic resolver result shape (format, bucket, path, errorCode).
- Keep normalization for `supabase-sig://`, legacy Supabase URLs, and bare paths.
- Return explicit error codes (`OBJECT_NOT_FOUND`, `PERMISSION`, `MALFORMED_INPUT`) instead of silent null context.

2) `src/lib/mediaResolver.ts`
- For bare signature-like paths:
  - Try Supabase signature signing first.
  - If and only if error is `OBJECT_NOT_FOUND`, fallback to GCS proxy resolution.
  - If both fail, return null with explicit logged reason.
- Keep legacy/current formats supported consistently.

3) `src/pages/PodReport.tsx`
- Instrument raw signature inputs by slot (`pickup_driver`, `pickup_customer`, `delivery_driver`, `delivery_customer`) with job id.
- Log resolved URL per slot and explicit failure reason when null.
- In `SignatureCard`, add `onLoad` and `onError` logs with final `img src`.
- Distinguish “not signed” (raw null) vs “failed to resolve/load” (raw present, resolved null/error) so no silent failure.

Validation plan:
- Verify all 4 slots render for a current GCS-path job and a legacy Supabase-path job.
- Verify no raw `supabase-sig://` or bare unresolved paths are sent to `<img src>`.
- Confirm failure classification in logs:
  - current records: resolved via GCS fallback after Supabase `OBJECT_NOT_FOUND`.
  - legacy records: resolved via Supabase signed URL.
- Smoke check with super admin + admin (driver if available) to confirm no role-specific regression.

Files to change:
- `src/lib/internalStorageService.ts`
- `src/lib/mediaResolver.ts`
- `src/pages/PodReport.tsx`

Architecture decision:
- **Client-side signing retained**.
- No new Edge Function needed; the issue is resolver backend-detection/fallback, not a structural auth limitation.
