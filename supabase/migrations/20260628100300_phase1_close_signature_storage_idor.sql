-- =====================================================================
-- Phase 1 / Stage 5b: close the vehicle-signatures storage-API IDOR
-- =====================================================================
-- NEW finding (surfaced during the C5/C6 deferred-risk review):
-- When `vehicle-signatures` was made private (20260315032750) and given an
-- org-scoped SELECT policy, the ORIGINAL permissive policies from 20260225231715
-- ("Allow public read/upload/update/delete vehicle-signatures", all USING(true),
-- no TO clause → PUBLIC) were NEVER dropped. Because RLS policies are OR'd
-- (permissive), that leftover `USING(true)` SELECT policy still lets any
-- authenticated (and likely anon) caller read ANY org's signature directly via
-- the storage API — bypassing the resolve-signature-url org check shipped in
-- Stage 4. This means the C1 signature IDOR was only half-closed.
--
-- This migration removes the permissive policies and replaces the write policies
-- with org-scoped equivalents. Signature DISPLAY is unaffected (it uses
-- service-role signed URLs, which bypass RLS, plus the existing org-scoped read
-- policy). Signature CAPTURE and RE-CAPTURE (upsert overwrite) keep working via
-- the new org-scoped INSERT/UPDATE policies.
--
-- Object path convention: jobs/<jobId>/signatures/<type>/<role>.<ext>
-- => owning org = jobs.org_id for that jobId (same model as the existing
--    "Authenticated users can read org signatures" policy).
-- =====================================================================

-- 1) Drop the leftover fully-permissive policies (the actual IDOR).
DROP POLICY IF EXISTS "Allow public read vehicle-signatures"   ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload vehicle-signatures" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update vehicle-signatures" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete vehicle-signatures" ON storage.objects;

-- 2) Drop the permissive bucket-only INSERT policy (added in 20260315032750)
--    and replace it with an org-scoped one below.
DROP POLICY IF EXISTS "Authenticated users can upload signatures" ON storage.objects;

-- NOTE: the org-scoped SELECT policy "Authenticated users can read org signatures"
-- (from 20260315032750) is intentionally LEFT IN PLACE — it is the read path.

-- 3) Org-scoped INSERT (signature capture).
CREATE POLICY "vehicle_signatures_insert_org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-signatures'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND storage.objects.name LIKE 'jobs/' || j.id::text || '/%'
    )
  )
);

-- 4) Org-scoped UPDATE (needed because signature upload uses upsert=true, which
--    overwrites the deterministic path on re-capture).
CREATE POLICY "vehicle_signatures_update_org"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'vehicle-signatures'
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
  bucket_id = 'vehicle-signatures'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND storage.objects.name LIKE 'jobs/' || j.id::text || '/%'
    )
  )
);

-- 5) Org-scoped DELETE.
CREATE POLICY "vehicle_signatures_delete_org"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'vehicle-signatures'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
        AND storage.objects.name LIKE 'jobs/' || j.id::text || '/%'
    )
  )
);
