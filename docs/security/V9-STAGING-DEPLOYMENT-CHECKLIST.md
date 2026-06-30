# V9 — Staging Deployment Checklist

Validates `supabase/migrations/20260629100100_photos_server_side_links_and_org.sql`
(**V9**: photos `org_id` derived from the job + job-based INSERT authorization;
**V6** rides along: `photos.damage_item_id` + `damage_items.photo_url` sync trigger).

> **Scope:** documentation/validation only. No code changes unless a step below
> exposes a confirmed defect. Apply on a **staging project seeded with
> production-like data**; treat staging data as production-confidential.

Set once:
```bash
export REF=<staging-project-ref>
export DB_URL="postgresql://postgres:<pwd>@db.<staging-ref>.supabase.co:5432/postgres"
```

---

## 0. Pre-flight (before applying)

- [ ] Staging restored from a production backup; manual backup of staging taken now.
- [ ] **ORG-DIVERGENCE AUDIT (critical).** The migration's BEFORE INSERT trigger only
  re-tags *new* photos. Legacy photos whose `org_id` already differs from their job
  will remain mis-tagged and stay hidden from job-org reviewers. Measure first:
  ```sql
  SELECT count(*) AS mismatched_photos
  FROM public.photos p JOIN public.jobs j ON j.id = p.job_id
  WHERE p.org_id IS DISTINCT FROM j.org_id;
  ```
  - **Expected:** `0`. Record the number.
  - **If > 0:** this is a confirmed pre-existing data defect. Run the one-off backfill
    below (review the rows first), then re-run the audit until it returns `0`:
    ```sql
    -- BACKFILL (only if the audit found mismatches; runs as the migration/service role)
    UPDATE public.photos p
       SET org_id = j.org_id
      FROM public.jobs j
     WHERE j.id = p.job_id
       AND p.org_id IS DISTINCT FROM j.org_id;
    ```
- [ ] Note current photos policy set for diffing:
  ```sql
  SELECT policyname, cmd FROM pg_policies
  WHERE schemaname='public' AND tablename='photos' ORDER BY policyname;
  -- Expect the single "Org members can manage photos" (FOR ALL) pre-migration.
  ```

---

## 1. Migration order
1. `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260629100100_photos_server_side_links_and_org.sql`

> V9 is self-contained. The V1 migration (`20260629100000`) is independent and not
> required for V9 — apply it per its own checklist (`EVIDENCE-PIPELINE-FIXES.md`).

---

## 2. Rollback order
1. `psql "$DB_URL" -f supabase/rollback/20260629100100_photos_server_side_links_and_org.down.sql`

Restores the single `FOR ALL` photos policy and drops the two triggers/functions.
The additive `photos.damage_item_id` column is left in place (harmless). Roll back if
any verification below fails with correct data but wrong access/visibility.

---

## 3. RLS verification (policies)
```sql
-- 3a. New split policies exist; the old FOR ALL policy is gone.
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='photos' ORDER BY policyname;
-- Expect exactly: photos_select_org (SELECT), photos_insert_job_org (INSERT),
--                 photos_update_org (UPDATE), photos_delete_org (DELETE).
-- "Org members can manage photos" must NOT be present.
```
- [ ] **3b. SELECT scope (driver of org A).**
  ```sql
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub','<driverA_uid>','role','authenticated')::text, true);
  SELECT count(*) AS visible,
         count(*) FILTER (WHERE org_id <> '<orgA_id>') AS cross_org
  FROM public.photos;            -- expect cross_org = 0
  RESET ROLE;
  ```
- [ ] **3c. INSERT authorized by the JOB's org (negative).** As driver A, attempt to insert
  a photo for a job in **org B** → must be denied by RLS:
  ```sql
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims',
    json_build_object('sub','<driverA_uid>','role','authenticated')::text, true);
  INSERT INTO public.photos (job_id, type, url) VALUES ('<orgB_jobId>','test','x');
  -- EXPECT: ERROR new row violates row-level security policy
  ROLLBACK;  -- (run inside a transaction; do not keep the row)
  ```
- [ ] **3d. INSERT allowed for own-org job (positive).** Same as 3c but `<orgA_jobId>` →
  succeeds; then confirm the stored `org_id` equals org A (trigger). `ROLLBACK` after.

---

## 4. Trigger verification
```sql
-- 4a. Both triggers exist.
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.photos'::regclass AND NOT tgisinternal
ORDER BY tgname;       -- expect trg_photos_set_org, trg_photos_sync_damage
```
- [ ] **4b. org_id is overridden from the job (V9).** Insert a photo with a deliberately
  WRONG org_id (as service role / in a transaction) and confirm it is stored as the job's org:
  ```sql
  BEGIN;
  INSERT INTO public.photos (job_id, org_id, type, url)
  VALUES ('<anyJobId>', '00000000-0000-0000-0000-000000000000', 'test', 'http://x')
  RETURNING org_id;   -- expect = (SELECT org_id FROM jobs WHERE id='<anyJobId>')
  ROLLBACK;
  ```
- [ ] **4c. damage_items.photo_url sync (V6).** Insert a photo with `damage_item_id` set and
  confirm the damage row's `photo_url` is updated atomically:
  ```sql
  BEGIN;
  INSERT INTO public.photos (job_id, type, url, damage_item_id)
  VALUES ('<jobId>', 'damage_close_up', 'http://new-url', '<damageItemId>');
  SELECT photo_url FROM public.damage_items WHERE id='<damageItemId>';  -- expect 'http://new-url'
  ROLLBACK;
  ```

---

## 5. Storage verification
- [ ] Existing objects unaffected (V9 changes no buckets/storage policies). Open an existing
  job's photo/POD in the app as a **job-org admin** → image renders via `gcs-proxy`.
- [ ] A photo object remains reachable only to its org: as a **different-org** user, requesting
  the same `gcs-proxy?path=jobs/<thatJob>/...` returns **403** (unchanged from Stage 4).

---

## 6. Upload verification (end-to-end driver capture)
- [ ] As a driver in org A, complete an inspection on an org-A job with: standard photos,
  a damage close-up, and signatures. Submit (online).
- [ ] Confirm in the DB:
  ```sql
  SELECT p.id, p.org_id, j.org_id AS job_org, p.damage_item_id
  FROM public.photos p JOIN public.jobs j ON j.id = p.job_id
  WHERE p.job_id = '<orgA_jobId>' ORDER BY p.created_at DESC;
  -- p.org_id == job_org for every row; damage close-up has damage_item_id set.
  SELECT photo_url FROM public.damage_items WHERE inspection_id='<inspId>';
  -- photo_url populated (trigger), matches the uploaded photo URL.
  ```
- [ ] 0-byte guard (V7, same migration batch — optional): an empty upload is rejected
  (no photos row, no object).

---

## 7. Admin verification (org-scoped)
- [ ] Admin of **org A** opens the job → sees all inspection photos, damage close-ups, and
  signatures for that job.
- [ ] Admin of **org B** cannot see org-A photos anywhere (job list, job detail, review queue).
- [ ] Admin of org A can re-open/review and (if applicable) re-upload — INSERT passes
  (job in their org).

---

## 8. Driver verification
- [ ] Driver A sees only their own org's jobs/photos.
- [ ] Driver A cannot read another org's photos by any route (app + direct query → 0 rows / 403).
- [ ] A driver newly assigned to org A (via `assign-driver`) can upload to org-A jobs and the
  photos are tagged org A (not the driver's prior org, if any).

---

## 9. Super-admin verification
- [ ] Super-admin sees photos across **all** orgs (bypass).
- [ ] Super-admin can open any org's job, review, and generate its POD.
- [ ] `is_super_admin()` path: a super-admin INSERT for any job's photo passes the INSERT policy.

---

## 10. POD verification (on-screen)
- [ ] Open the POD for the org-A job as the **job-org admin**: every captured photo renders
  (no "Photo unavailable" for own-org images).
- [ ] Damage close-up renders against its damage entry (driven by `damage_items.photo_url`,
  now trigger-synced — V6). Confirm even when the legacy client-side `photo_url` update
  did not run.
- [ ] Driver and super-admin POD views render the same evidence (role-appropriate scope).

---

## 11. PDF verification
- [ ] Generate/download the POD **PDF** for the org-A job: all inspection photos, both
  signatures, and damage close-up images are embedded (not placeholders).
- [ ] Repeat for a delivery POD (pickup + delivery sections) and a job with multiple damage
  items — each damage's photo appears against the correct item (depends on V1 ordering +
  V6 link).
- [ ] No image fetch errors in the `gcs-proxy` logs during PDF generation for own-org images.

---

## Go / No-Go (V9)
**GO** to production only if: org-divergence audit = 0 (after any backfill); all RLS/trigger
queries return the expected results; cross-org access is denied; admin/driver/super-admin
visibility is correct; POD on-screen and PDF render all evidence. **STOP and report** on any
mismatch, any cross-org leak, any legit-user 403 with correct data, or any missing image.

**Production apply order:** run the §0 audit (+ backfill if needed) on prod, then
`psql "$PROD_DB_URL" -f .../20260629100100_*.sql`, then re-run §3–11 on prod.
**Rollback:** `…20260629100100_*.down.sql`.
