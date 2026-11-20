-- Rollback for 20261120140000_pod_storage_follow_permissions.sql.
-- Restores the previous POD storage policies: any member of the organisation (drivers
-- included) can read, upload, overwrite and delete every POD PDF and photo zip.
-- WARNING: this re-opens the files to every driver login, whatever their "View PODs"
-- permission says. These are the policies as they were in production before the change.
BEGIN;

DROP POLICY IF EXISTS pod_pdfs_select_org ON storage.objects;
CREATE POLICY pod_pdfs_select_org ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'pod-pdfs' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text)));
DROP POLICY IF EXISTS pod_pdfs_insert_org ON storage.objects;
CREATE POLICY pod_pdfs_insert_org ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'pod-pdfs' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text)));
DROP POLICY IF EXISTS pod_pdfs_update_org ON storage.objects;
CREATE POLICY pod_pdfs_update_org ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'pod-pdfs' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text))) WITH CHECK (bucket_id = 'pod-pdfs' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text)));
DROP POLICY IF EXISTS pod_pdfs_delete_org ON storage.objects;
CREATE POLICY pod_pdfs_delete_org ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'pod-pdfs' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text)));

DROP POLICY IF EXISTS pod_photos_select_org ON storage.objects;
CREATE POLICY pod_photos_select_org ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'pod-photos' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text)));
DROP POLICY IF EXISTS pod_photos_insert_org ON storage.objects;
CREATE POLICY pod_photos_insert_org ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'pod-photos' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text)));
DROP POLICY IF EXISTS pod_photos_update_org ON storage.objects;
CREATE POLICY pod_photos_update_org ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'pod-photos' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text))) WITH CHECK (bucket_id = 'pod-photos' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text)));
DROP POLICY IF EXISTS pod_photos_delete_org ON storage.objects;
CREATE POLICY pod_photos_delete_org ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'pod-photos' AND (public.is_super_admin() OR (split_part(name, '/', 1) = (public.user_org_id())::text)));

COMMIT;
