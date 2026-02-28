

## Plan: Canonical Human Job ID (`AX0001`) — Generation, Sync & Display

### Current State
- `external_job_number` stores `AX####` IDs in the DB
- App-side `generateJobNumber()` in `api.ts` already generates `AX####` on job creation
- Edge function also generates `AX####` during pull if missing
- **Problem**: The AX ID is shown inconsistently — as a subtitle on cards, buried as "Ref:" on detail/POD pages, not prominently displayed

### Strategy: Option A (App Generates Job ID)
The app already generates `AX####` via `generateJobNumber()`. The edge function also generates them during import. This means "Job ID" in Job Master is always populated on first push, so the Apps Script never overwrites.

No changes needed to the generation logic — it already works correctly.

---

### Changes Required

#### 1. `src/components/JobCard.tsx` — Show AX ID prominently
- Change the card header to display `jobId` (AX number) as the **primary subtitle** below client name
- Currently `jobId` prop shows as `p` subtitle — make it more prominent: `"Job {jobId}"` format
- Keep client name as the main h3

#### 2. `src/pages/JobDetail.tsx` (line ~63, 71, 85)
- Change header title from `job.vehicle_reg` to `Job {jobRef}` (e.g., "Job AX0007")
- Move "Ref: {job.external_job_number}" into a more prominent position in the vehicle card — display as `"Job AX0007"` with bold styling instead of muted "Ref:" text

#### 3. `src/pages/PodReport.tsx` (line ~125, 170, 195)
- Change POD heading from `"Ref: {ref}"` to `"Job {ref}"`
- Update the DetailRow label from `"Job Reference"` to display `"Job {ref}"` prominently in the header area

#### 4. `src/pages/CompletedJobs.tsx` (line ~20)
- Already passes `job.external_job_number || job.id.slice(0, 8)` as `jobId` — no change needed

#### 5. `src/pages/JobList.tsx`
- Already passes `job.external_job_number || job.id.slice(0, 8)` — no change needed

#### 6. `src/pages/AdminDashboard.tsx` (line ~186, 196)
- Change "Ref" table header to "Job ID"
- Already displays `job.external_job_number || job.id.slice(0, 8)` — format as `"Job {id}"`

#### 7. `src/lib/podPdf.ts` (line ~96, 125)
- Change PDF `"Ref: {ref}"` to `"Job {ref}"`

#### 8. `supabase/functions/google-sheets-sync/index.ts`
- **Push handler**: Verify "Job ID" column writes `external_job_number` (already does at line 833) — confirmed correct
- **Pull handler**: Verify imported jobs get `external_job_number` set (already does at lines 635-638 + 734-752) — confirmed correct
- No edge function changes needed

### Files to modify
1. `src/components/JobCard.tsx` — prominent AX ID display
2. `src/pages/JobDetail.tsx` — header + vehicle card
3. `src/pages/PodReport.tsx` — POD header
4. `src/pages/AdminDashboard.tsx` — table header label
5. `src/lib/podPdf.ts` — PDF header text

### No DB or edge function changes required
The generation and sync logic is already correct. This is purely a UI visibility upgrade.

