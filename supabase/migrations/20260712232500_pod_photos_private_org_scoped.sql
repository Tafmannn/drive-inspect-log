-- =====================================================================
-- pod-photos bucket: private, org-scoped storage for POD photo zips
-- =====================================================================
-- The POD PDF used to embed every collection/delivery photo inline, which
-- bloated the file (multi-MB for a handful of photos) and re-rendered every
-- image on every generation. Photos are now zipped client-side and uploaded
-- here instead, with the PDF/email carrying a signed download link. Mirrors
-- the existing pod-pdfs bucket exactly: private bucket, org-scoped RLS keyed
-- off the first path segment (`<orgId>/<file>.zip`).
-- Reversible; no objects moved or deleted.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('pod-photos', 'pod-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "pod_photos_select_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_photos_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_photos_update_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_photos_delete_org" ON storage.objects;

CREATE POLICY "pod_photos_select_org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'pod-photos'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);

CREATE POLICY "pod_photos_insert_org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'pod-photos'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);

-- UPDATE needed: zip upload uses upsert=true (regenerated POD overwrites).
CREATE POLICY "pod_photos_update_org"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'pod-photos'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
)
WITH CHECK (
  bucket_id = 'pod-photos'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);

CREATE POLICY "pod_photos_delete_org"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'pod-photos'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);
