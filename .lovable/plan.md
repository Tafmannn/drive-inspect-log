
## 1) Current implementation map (audited)

- **Inspection capture**
  - `src/pages/InspectionFlow.tsx`
  - Submits `inspections.inspected_by_name`, `customer_name`, `driver_signature_url`, `customer_signature_url`.
  - Current prefill sets `driverName` fallback to literal `"Driver"`.

- **Job/POD data loading**
  - `src/lib/api.ts` (`getJobWithRelations`) loads jobs + inspections + photos; computes `resolvedDriverName`.
  - `src/hooks/useJobs.ts` uses this for `useJob()`.

- **Media/signature resolution**
  - `src/lib/mediaResolver.ts` and `src/lib/resolveSignatureUrlSimple.ts` currently do `fetch(..., { redirect: "manual" })` against `gcs-proxy` and try to read `Location`.
  - `src/pages/PodReport.tsx` and `src/pages/JobDetail.tsx` rely on those resolvers.
  - `src/lib/podPdf.ts` uses the same signature resolver before embedding signatures in PDF.

- **Photo viewer**
  - `src/components/PhotoViewer.tsx` currently renders images with `crossOrigin="anonymous"` and download via `fetch()`.

- **Backend**
  - `supabase/functions/gcs-proxy/index.ts` exists and is used for GCS access.
  - DB confirms this job has persisted photos/signatures; issue is retrieval, not missing data.

## 2) Root cause analysis (from code + DB + network evidence)

1. **Photos/signatures not visible**
   - Browser network shows repeated `gcs-proxy` calls with **Status 0** (opaque response pattern), caused by manual-redirect resolution flow in cross-origin browser context.
   - Resolver returns `null`, so UI shows empty galleries / “Not signed”.

2. **Name not pulling on signature/POD/PDF**
   - `InspectionFlow` hardcodes `driverName` default to `"Driver"`.
   - That value is persisted into `inspections.inspected_by_name`, then reused by POD/PDF.

3. **“Signature still not pulling”**
   - Signatures are present in DB as GCS bare paths.
   - Failing resolution path (manual redirect) prevents display.

4. **“Only future jobs, no historic signature dependency”**
   - Current resolver carries legacy branches and brittle behavior; needs a clean, canonical forward path.

## 3) Minimal safe fix plan (patch existing logic, no workflow rewrite)

### A. Replace brittle media resolution path (primary fix)
**Files**
- `src/lib/mediaResolver.ts`
- `src/lib/resolveSignatureUrlSimple.ts`

**Changes**
- Stop using `fetch(... redirect: "manual")` for resolution.
- Return a **tokenized proxy URL** (`/functions/v1/gcs-proxy?path=...&token=...`) directly for GCS/bare paths.
- Keep support for `supabase-sig://...` for internal signatures.
- Keep function signatures unchanged so existing callers remain intact.

**Why**
- Removes status-0 failure mode and restores image/signature rendering without changing page workflows.

---

### B. Recreate forward signature naming logic for future jobs
**File**
- `src/pages/InspectionFlow.tsx`

**Changes**
- Replace `"Driver"` default with fallback chain:
  1) `job.resolvedDriverName`
  2) `job.driver_name`
  3) authenticated user display name
  4) empty string (not `"Driver"`).
- Add validation guard so placeholder/generic `"Driver"` is not accepted for new submissions.

**Why**
- Future inspections won’t persist generic driver names; POD/PDF will have real names.

---

### C. Harden display fallback for existing records (no migration required)
**Files**
- `src/pages/PodReport.tsx`
- `src/lib/podPdf.ts`
- `src/lib/podEmail.ts` (same signature/name section)

**Changes**
- For driver signature labels/details, use fallback chain when `inspected_by_name` is empty/generic:
  1) inspection `inspected_by_name` if meaningful
  2) `job.resolvedDriverName`
  3) `job.driver_name`
  4) `"—"`.

**Why**
- Fixes currently visible POD/PDF name issue immediately, while future captures are corrected at source.

---

### D. Photo viewer reliability tweak
**File**
- `src/components/PhotoViewer.tsx`

**Changes**
- Remove unnecessary `crossOrigin="anonymous"` on `<img>` elements used only for display.
- Keep existing UI/controls; preserve current download fallback behavior.

**Why**
- Prevents avoidable image render failures with signed/proxied URLs.

---

### E. Backend connectivity/edge-function verification pass
**Files**
- No functional DB schema changes expected.
- Deploy only if touched: `gcs-proxy` (if any backend patch needed), otherwise frontend-only deploy.

**Checks**
- Confirm `gcs-proxy` and `gcs-upload` are deployed and responding.
- Validate one real photo URL + one signature URL end-to-end via app network after patch.

## 4) Migrations / RLS

- **No migration required** for this batch.
- **No new tables/columns required**.
- Existing RLS on `photos`, `inspections`, `jobs` remains source of truth.

## 5) Verification checklist (workflow-level)

1. Open existing job with persisted photos/signatures:
   - Inspection Photos section shows thumbnails immediately.
   - Tapping opens full viewer.
2. POD page:
   - Signatures render for pickup/delivery where URLs exist.
   - Driver names no longer show generic “Driver” when job has assigned driver identity.
3. Generate/share PDF:
   - Signature blocks show names via fallback chain and render where accessible.
4. Start a **new** pickup/delivery inspection:
   - Driver name is prefilled from assigned driver chain (not literal “Driver”).
   - Submit writes meaningful `inspected_by_name`.
   - POD/PDF for this new job show correct driver name and signatures.
5. Confirm no lifecycle break:
   - job created → assigned → pickup → delivery → POD → admin review/completion still unchanged.
