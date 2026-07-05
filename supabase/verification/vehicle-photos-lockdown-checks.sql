-- =====================================================================
-- Verification queries for 20260630100000_phase1_close_vehicle_photos_public_bucket
-- =====================================================================
-- Run against the LIVE database (Supabase SQL editor or psql as a superuser/
-- service role). These do NOT modify data. They prove the lockdown is correct
-- and that no existing evidence became unreadable.
--
-- IMPORTANT: this repo is Lovable-managed and its migrations may not fully
-- describe the live DB. Run section (A) BEFORE applying the migration to capture
-- the real starting state; run (B)+(C) AFTER applying to confirm the end state.
-- =====================================================================


-- =====================================================================
-- (A) PRE-APPLY — capture live state, and find objects that would break
-- =====================================================================

-- A1. Current bucket flag (expect: public = true before, false after).
SELECT id, name, public
FROM storage.buckets
WHERE id = 'vehicle-photos';

-- A2. Current policies on storage.objects mentioning vehicle-photos
--     (expect the four "Allow public …" policies before the migration).
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (qual ILIKE '%vehicle-photos%' OR with_check ILIKE '%vehicle-photos%' OR policyname ILIKE '%vehicle-photos%')
ORDER BY policyname;

-- A3. CRITICAL PRE-CHECK: objects whose path does NOT start with jobs/<uuid>/.
--     These have no owning job → they become unreadable to non-super-admins
--     after lockdown (fails closed). Expect 0. If > 0, inspect before shipping.
SELECT count(*) AS non_conforming_objects
FROM storage.objects
WHERE bucket_id = 'vehicle-photos'
  AND name !~ '^jobs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/';

-- A3b. If the above is > 0, list a sample so you can decide (migrate paths /
--      accept super-admin-only visibility / leave as-is).
SELECT name, created_at
FROM storage.objects
WHERE bucket_id = 'vehicle-photos'
  AND name !~ '^jobs/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
ORDER BY created_at DESC
LIMIT 25;

-- A4. Sanity: total object count (compare before/after — must be UNCHANGED;
--     the migration never deletes objects).
SELECT count(*) AS total_vehicle_photos
FROM storage.objects
WHERE bucket_id = 'vehicle-photos';


-- =====================================================================
-- (B) POST-APPLY — confirm the lockdown
-- =====================================================================

-- B1. Bucket is now private (expect: public = false).
SELECT id, public
FROM storage.buckets
WHERE id = 'vehicle-photos';

-- B2. The four permissive public policies are GONE (expect: 0 rows).
SELECT policyname
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN (
    'Allow public read vehicle-photos',
    'Allow public upload vehicle-photos',
    'Allow public update vehicle-photos',
    'Allow public delete vehicle-photos'
  );

-- B3. The four org-scoped policies exist and are TO authenticated only
--     (expect exactly these four; roles = {authenticated}).
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN (
    'vehicle_photos_select_org',
    'vehicle_photos_insert_org',
    'vehicle_photos_update_org',
    'vehicle_photos_delete_org'
  )
ORDER BY policyname;

-- B4. Object count unchanged vs A4 (no evidence deleted/moved).
SELECT count(*) AS total_vehicle_photos
FROM storage.objects
WHERE bucket_id = 'vehicle-photos';


-- =====================================================================
-- (C) NEGATIVE / POSITIVE RLS TESTS (simulate real callers)
-- =====================================================================
-- storage RLS helpers resolve the caller from public.user_profiles via
-- auth.uid(). To simulate a specific caller in psql, set the request JWT claims
-- and switch to the `authenticated` role inside a transaction. Replace the two
-- placeholder UUIDs with real values from your DB:
--   :driver_a_uid  = auth_user_id of a driver in ORG A
--   :photo_a_path  = a real object name in ORG A, e.g. 'jobs/<jobA>/pickup/exterior_front/<id>.jpg'
--   :photo_b_path  = a real object name in ORG B (different org)
--
-- Pick fixtures first:
SELECT up.auth_user_id AS driver_uid, up.org_id
FROM public.user_profiles up
WHERE up.role = 'driver'
LIMIT 3;

SELECT o.name, j.org_id
FROM storage.objects o
JOIN public.jobs j ON o.name LIKE 'jobs/' || j.id::text || '/%'
WHERE o.bucket_id = 'vehicle-photos'
LIMIT 5;

-- ── C1. ANON cannot read any vehicle photo (expect: 0 rows) ──
BEGIN;
  SET LOCAL role anon;
  SELECT count(*) AS anon_visible_photos
  FROM storage.objects
  WHERE bucket_id = 'vehicle-photos';
ROLLBACK;

-- ── C2. Driver in ORG A CAN see ORG A photos (expect: > 0) ──
-- Replace <DRIVER_A_UID> with a real value from the fixtures query above.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<DRIVER_A_UID>","role":"authenticated"}';
  SELECT count(*) AS org_a_visible
  FROM storage.objects o
  WHERE o.bucket_id = 'vehicle-photos'
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND o.name LIKE 'jobs/' || j.id::text || '/%'
    );
ROLLBACK;

-- ── C3. Driver in ORG A CANNOT see ORG B photos (expect: 0 rows) ──
-- Uses the same driver but counts objects belonging to any OTHER org.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<DRIVER_A_UID>","role":"authenticated"}';
  SELECT count(*) AS cross_org_visible
  FROM storage.objects o
  WHERE o.bucket_id = 'vehicle-photos'
    AND NOT EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND o.name LIKE 'jobs/' || j.id::text || '/%'
    )
    -- but the object IS owned by a real (other-org) job, i.e. it is real evidence
    AND EXISTS (
      SELECT 1 FROM public.jobs j2
      WHERE o.name LIKE 'jobs/' || j2.id::text || '/%'
    );
ROLLBACK;

-- ── C4. Super-admin sees ALL vehicle photos (expect: = total from B4) ──
-- Replace <SUPERADMIN_UID> with a real super_admin auth_user_id.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<SUPERADMIN_UID>","role":"authenticated"}';
  SELECT count(*) AS superadmin_visible,
         public.is_super_admin() AS is_super
  FROM storage.objects o
  WHERE o.bucket_id = 'vehicle-photos';
ROLLBACK;

-- ── C5. Driver in ORG A CANNOT insert a photo under an ORG B job path ──
-- Expect: INSERT raises new row violates row-level security policy.
-- Replace <DRIVER_A_UID> and <ORG_B_JOB_ID> with real values.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<DRIVER_A_UID>","role":"authenticated"}';
  -- This should FAIL (RLS). Wrapped in a savepoint so the file keeps running.
  SAVEPOINT s;
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('vehicle-photos', 'jobs/<ORG_B_JOB_ID>/pickup/exterior_front/rls-test.jpg', NULL);
  ROLLBACK TO SAVEPOINT s;
ROLLBACK;
