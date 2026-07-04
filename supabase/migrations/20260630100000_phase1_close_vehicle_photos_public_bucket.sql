-- =====================================================================
-- Phase 1 / C6: close the public vehicle-photos bucket (evidence integrity)
-- =====================================================================
-- DEFECT (deferred from 20260628100200, which explicitly left this bucket as-is):
--   `vehicle-photos` was created public=true (20260225231715) with four fully
--   permissive policies that have NO `TO` clause, so they apply to `anon`:
--     "Allow public read/upload/update/delete vehicle-photos" USING(bucket_id=...)
--   Result: ANY person on the internet could read, OVERWRITE, or DELETE customer
--   collection/delivery photos — the core POD evidence — and every internal-backend
--   photo was served via a permanent public URL, bypassing the org-scoped gcs-proxy.
--
-- FIX (mirrors the vehicle-signatures lockdown in 20260315032750 + 20260628100300):
--   * Make the bucket private.
--   * Drop the four permissive public policies.
--   * Add org/job-scoped SELECT/INSERT/UPDATE/DELETE policies. Photo object paths
--     are `jobs/<jobId>/...`, so the owning org is jobs.org_id for that jobId
--     (same model already used for signatures). UPDATE is required because the
--     internal upload path uses upsert=true (re-capture overwrites the object).
--
-- NON-DESTRUCTIVE: no objects are moved or deleted. Existing photos remain; they
--   are now served via short-lived Supabase signed URLs (client re-signs at read
--   time — see src/lib/vehiclePhotoUrl.ts). GCS-backed photos are unaffected (they
--   live in the external axentra_db bucket, served via gcs-proxy).
--
-- PRE-APPLY CHECK: any vehicle-photos object whose name does NOT start with
--   `jobs/<uuid>/` will become unreadable to non-super-admins (no owning job to
--   resolve org from). Run the pre-apply query in
--   supabase/verification/vehicle-photos-lockdown-checks.sql FIRST and confirm the
--   count is 0 (or acceptable) before shipping. Fails closed by design.
-- =====================================================================

-- 1) Private bucket — no more permanent public object URLs.
UPDATE storage.buckets SET public = false WHERE id = 'vehicle-photos';

-- 2) Drop the fully-permissive (anon-inclusive) policies — the actual exposure.
DROP POLICY IF EXISTS "Allow public read vehicle-photos"   ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload vehicle-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update vehicle-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete vehicle-photos" ON storage.objects;

-- 3) Org/job-scoped SELECT (read/display + createSignedUrl).
--    The second EXISTS covers LEGACY expense receipts that an older code path
--    wrote into THIS bucket under `expense-receipts/<expenseId>/...` (current
--    uploads correctly use the dedicated expense-receipts bucket). They stay
--    readable by the owning expense's org so no receipt evidence is orphaned.
CREATE POLICY "vehicle_photos_select_org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'vehicle-photos'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND storage.objects.name LIKE 'jobs/' || j.id::text || '/%'
    )
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.org_id = public.user_org_id()
        AND storage.objects.name LIKE 'expense-receipts/' || e.id::text || '/%'
    )
  )
);

-- 4) Org/job-scoped INSERT (photo capture). A driver can only upload under a
--    job that belongs to their own org.
CREATE POLICY "vehicle_photos_insert_org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-photos'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND storage.objects.name LIKE 'jobs/' || j.id::text || '/%'
    )
  )
);

-- 5) Org/job-scoped UPDATE (internal upload uses upsert=true → overwrites path).
CREATE POLICY "vehicle_photos_update_org"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'vehicle-photos'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND storage.objects.name LIKE 'jobs/' || j.id::text || '/%'
    )
  )
)
WITH CHECK (
  bucket_id = 'vehicle-photos'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND storage.objects.name LIKE 'jobs/' || j.id::text || '/%'
    )
  )
);

-- 6) Org/job-scoped DELETE.
CREATE POLICY "vehicle_photos_delete_org"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'vehicle-photos'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND storage.objects.name LIKE 'jobs/' || j.id::text || '/%'
    )
  )
);
