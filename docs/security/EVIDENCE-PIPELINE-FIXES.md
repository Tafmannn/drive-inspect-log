# Evidence Pipeline Fixes (V1–V9)

Fixes for the confirmed defects from the inspection-evidence-pipeline verification
(driver capture → compression → IndexedDB staging → upload → photos insert →
submission → review → POD). **Nothing here is deployed.** Apply the migrations and
redeploy `gcs-upload` through the normal gated staging → prod flow.

## Status

| ID | Sev | Fixed in | Summary |
|----|-----|----------|---------|
| **V1** | HIGH | `migrations/20260629100000` | Idempotent replay returned `damageItemIds` ordered by `created_at` (tied) → photos mislinked/lost. Added `damage_items.submission_index`; replay now orders by it. |
| **V2** | HIGH | `pendingUploads.ts` | Items stranded in `"uploading"` (crash mid-upload) were invisible & never retried. `loadAll` re-arms them to `"ready"`. |
| **V3** | HIGH | `pendingUploads.ts` | Unserialized IDB read-modify-write clobbered concurrent promote/drain/retry. All mutations now run under a single-flight lock. |
| **V4** | MED | `pendingUploads.ts` | Missing blob was silently marked "done". Now a hard failure surfaced for re-capture. |
| **V5** | MED | `functions/gcs-upload` | Random server names orphaned a new GCS object on every failed-insert retry / re-capture. Names are now deterministic (retries overwrite). |
| **V6** | MED | `migrations/20260629100100` + `pendingUploads.ts` | Damage→photo link was best-effort. Added `photos.damage_item_id` + an AFTER INSERT trigger that syncs `damage_items.photo_url` atomically. |
| **V7** | MED | `gcs-upload` + `internalStorageService` + `pendingUploads.ts` | 0-byte uploads accepted. Rejected at client + both storage backends. |
| **V8** | MED (partial) | `submitQueue.ts` | Discarding a submission whose signatures already uploaded orphaned the objects. Now logged (`submit_queue_signature_orphaned`) for a GC sweep. A direct delete needs a dedicated storage-delete edge function — tracked follow-up. |
| **V9** | MED | `migrations/20260629100100` | `photos.org_id` was client-tagged (driver's org) vs the job's org → invisible to job-org reviewers. A BEFORE INSERT trigger now derives org from the job; INSERT is authorized by the job's org. |

Client-verifiable fixes are covered by `src/test/evidence-pipeline-fixes.test.ts` (V2/V3/V4/V7).
Local validation: typecheck ✓ · vitest 310/310 ✓ · build ✓.

## Migrations (apply in order, each has a rollback in `supabase/rollback/`)
1. `20260629100000_fix_damage_items_replay_ordering.sql` (V1)
2. `20260629100100_photos_server_side_links_and_org.sql` (V6 + V9)

## Deploy order (gated; staging first, same model as PHASE-1-STAGING-VALIDATION.md)
```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260629100000_*.sql   # V1
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260629100100_*.sql   # V6 + V9
supabase functions deploy gcs-upload --project-ref "$REF"                        # V5 + V7
```

## Verification (staging, with production-like data)

### V1 — replay ordering
```sql
-- After a submit with N damage items, the replay must return ids in INPUT order.
-- (Run the RPC twice with the same session id and compare.)
SELECT id, submission_index FROM public.damage_items
WHERE inspection_id = '<inspId>' AND archived_at IS NULL
ORDER BY submission_index;        -- contiguous 0..N-1, matching capture order
```
**Pass:** new damage_items have contiguous `submission_index`; a replayed RPC returns
`damageItemIds` in that order; offline-submitted damage photos attach to the correct damage.

### V9 — photo org from job
```sql
-- Every photo's org now equals its job's org (no client divergence):
SELECT count(*) AS mismatched
FROM public.photos p JOIN public.jobs j ON j.id = p.job_id
WHERE p.org_id IS DISTINCT FROM j.org_id;          -- expect 0 for new inserts
```
App: a driver uploads an inspection photo; an **admin of the job's org** can see it.
Negative: a driver cannot insert a photo for a job in another org (RLS denies).

### V6 — durable damage link
App: capture a damage close-up; confirm the damage's photo renders in the POD even if the
legacy client `damage_items.photo_url` update is skipped (the trigger sets it).
```sql
SELECT d.id, d.photo_url, p.url
FROM public.damage_items d
JOIN public.photos p ON p.damage_item_id = d.id
WHERE d.inspection_id = '<inspId>';                -- d.photo_url == p.url
```

### V5 / V7 — naming + empty guard (gcs-upload)
- Upload the same item twice → exactly one GCS object (deterministic name; overwrite).
- A 0-byte upload → `400 File is empty`; no object, no photos row.

## Monitoring (added telemetry)
- `pending_upload_uploading_rearmed` (V2 recoveries)
- `submit_queue_signature_orphaned` (V8 — drives the GCS GC sweep)
- existing: `pending_upload_staged_purged`, `linkage_promote_mismatch`, `photo_upload_failed`.

## Rollback
Reverse order: `20260629100100_*.down.sql` then `20260629100000_*.down.sql`; `git revert` the
`gcs-upload`/client commits and redeploy. The additive columns
(`damage_items.submission_index`, `photos.damage_item_id`) are safe to leave.
