

## Audit Summary

The current system already has most of the right architecture in place:

### What works well
- **Job status updates are non-blocking**: `handleFinalSubmit` in `InspectionFlow.tsx` already submits inspection metadata + signatures synchronously, then queues photos to the background via `addPendingUpload()` (fire-and-forget)
- **Background retry**: After queuing, it calls `retryAllPending()` as fire-and-forget
- **Signatures upload synchronously** (lines 514-533) — this is correct since they're small and critical for POD
- **POD viewer** already uses `resolveImageUrl` for GCS proxying

### What needs changing

1. **Pending Uploads screen is per-photo, not per-job** — each queued asset gets its own row, which is noisy and non-actionable for drivers
2. **No automatic background retry on app launch** — if uploads fail and user doesn't visit Pending Uploads, they stay stuck
3. **Dashboard count** shows raw pending photo count, not job count
4. **`safePushToSheet` is not called after background uploads complete** — only called on mutation success, which happens before uploads finish
5. **No sheet sync trigger after retry success**

### Plan

#### Task 1: Add job-level grouping helpers to `pendingUploads.ts`
- Add `getPendingUploadsByJob()` that returns `Map<jobId, { jobId, jobNumber, vehicleReg, pendingCount, failedCount, lastErrorAt, items }>` 
- Add `retryJobUploads(jobId)` that retries only items for a specific job
- After all items for a job succeed, fire `safePushToSheet([jobId])`
- No schema changes

#### Task 2: Redesign `PendingUploads.tsx` to job-level view
- One card per job (not per photo)
- Show: job number, vehicle reg, pending/failed count, last error timestamp
- "Retry" button per job calls `retryJobUploads(jobId)`
- "Retry All" retries all jobs
- Remove per-photo detail rows

#### Task 3: Update Dashboard count to show job count, not photo count
- In `useJobs.ts` `useDashboardCounts`, change `pendingUploads` to count distinct jobs with pending/failed uploads (not raw item count)

#### Task 4: Add auto-retry on app mount
- In `App.tsx` or a new `useBackgroundUploader` hook, trigger `retryAllPending()` once on mount (fire-and-forget)
- This handles edge case A (app crash during upload — on reopen, retries automatically)

#### Task 5: Trigger `safePushToSheet` after successful job uploads
- In the retry logic, after all items for a job complete, call `safePushToSheet([jobId])`
- This ensures sheet sync happens even when uploads were deferred

### Files to modify
- `src/lib/pendingUploads.ts` — add job-level grouping + retry + sheet sync trigger
- `src/pages/PendingUploads.tsx` — redesign to job-level cards
- `src/hooks/useJobs.ts` — change pending count to distinct job count
- `src/App.tsx` — add auto-retry on mount (one line)

### Files NOT modified
- No DB schema changes
- No Google Sheets changes
- No edge function changes
- `InspectionFlow.tsx` unchanged (already non-blocking)
- `PodReport.tsx` unchanged (already works with partial uploads)
- `safePushToSheet.ts` unchanged

