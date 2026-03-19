
Goal: fix the “DB has photos/signatures but UI still blank” issue with minimal, targeted patches.

1) Audit findings (confirmed)
- Data exists: `photos` and `inspections.*_signature_url` rows are present for the failing job.
- Backend serves media: `gcs-proxy` edge logs show `GET 200` for signature/photo paths with `content_type=image/png`/image types.
- Client still makes failing legacy calls: repeated `POST /storage/v1/object/sign/vehicle-signatures/... -> 404 not_found`.
- So the gap is now client resolution/render orchestration, not missing DB records or missing files.

2) Root causes
- Signature resolver still “tries Supabase sign first” for bare GCS signature paths (`jobs/.../signatures/...`), creating noisy 404s and extra latency.
- POD media effect currently couples signature + photo resolution into one flow; photo resolution failure can prevent signature state commit.
- Photo/signature rendering relies only on resolved URL state; failures don’t retry gracefully.
- Driver-name fallback checks exact `"Driver"` only; generic variants can still leak through.

3) Minimal file change plan
A. `src/lib/resolveSignatureUrlSimple.ts`
- Make GCS bare signature paths first-class:
  - If path matches `jobs/.../signatures/...` => skip Supabase `createSignedUrl` entirely, return tokenized `gcs-proxy` URL immediately.
- Keep Supabase signing only for genuine legacy/internal `supabase-sig://vehicle-signatures/...` references.
- Add safe token fetch guard + deterministic fallback (never throw to caller).

B. `src/lib/mediaResolver.ts`
- Harden `getTokenizedProxyUrl` with try/catch and explicit null-safe behavior.
- Keep return contract unchanged, but ensure one bad token call doesn’t reject caller promises.

C. `src/pages/PodReport.tsx`
- Split media resolution into independent commits:
  - Resolve signatures and commit `resolvedSignatures` even if photos fail.
  - Resolve photos via `Promise.allSettled` so one bad photo never blocks all others.
- Add case-insensitive generic-name guard (`"driver"`, whitespace variants) in displayed signature labels.
- Keep current layout/workflow unchanged.

D. `src/pages/JobDetail.tsx`
- Use `Promise.allSettled` for admin gallery resolution.
- Ensure unresolved items do not suppress resolved items; keep existing PhotoViewer UX.

E. `src/lib/podPdf.ts`
- Reuse the hardened signature path behavior so PDF generation follows the same resolution rules.
- Preserve existing PDF structure and route flow.

F. `src/pages/InspectionFlow.tsx` (future-job hardening)
- Enforce non-generic driver name at submit (`trim + case-insensitive "driver"` guard).
- Keep “future jobs only” behavior without migration.

4) No schema/RLS migration
- No SQL migration required.
- No RLS changes required for this fix batch.

5) Verification checklist (must pass)
- POD page:
  - Signature images render for pickup/delivery.
  - Driver names in signature blocks use real driver identity, not generic placeholder.
- Admin Job Detail:
  - Inspection photo galleries render thumbnails and open viewer.
  - Download works from viewer.
- Network expectations:
  - No blocking dependence on `object/sign/vehicle-signatures` for GCS bare paths.
  - `gcs-proxy` requests return `200` for all displayed media.
- PDF:
  - Signature images and names appear in generated POD PDF.
- Regression:
  - Existing routes/workflow unchanged (job detail, inspection, pod, admin flow).

6) Deployment notes
- Frontend deploy required.
- If `gcs-proxy` code is touched in this pass, redeploy `gcs-proxy` function only.
- After deploy, hard-refresh mobile browser (clear cached JS chunk) before retest to avoid stale resolver logic.
