-- POD files in storage: follow the "View PODs" permission instead of the whole organisation.
--
-- Before: the pod-pdfs and pod-photos buckets allowed ANY member of the organisation
-- (drivers included) to read, upload, overwrite and delete every POD PDF and photo zip,
-- whatever their "View PODs" permission said. The screens hid PODs from a driver with the
-- permission switched off, but their login could still fetch the files directly.
--
-- After (the file's first folder must still be the caller's organisation):
--   read    (SELECT)          : an admin / super admin, or anyone holding pod.view
--   write   (INSERT, UPDATE)  : an admin / super admin, or anyone holding pod.view
--                               (the app uploads a POD with "overwrite if it exists" when
--                               someone shares or emails it, so sharing needs both)
--   delete  (DELETE)          : an admin / super admin, or anyone holding pod.manage
--                               (drivers do not have it by default; the app never deletes a POD)
-- The super admin keeps access to everything. Server functions use the service role and are
-- unaffected, and the client portal does not read these buckets directly.
--
-- Permissions come from user_has_permission(): a per-person override beats the role default,
-- and a suspended account has none. NOTE: the driver role default for pod.view is currently
-- ALLOWED, so a driver is blocked only once an admin denies it on their profile (as has been
-- done for two drivers). Changing that default is a separate decision.
--
-- Re-runnable: each policy is dropped and recreated. Rollback restores the old policies.

-- ── pod-pdfs ────────────────────────────────────────────────────
DROP POLICY IF EXISTS pod_pdfs_select_org ON storage.objects;
CREATE POLICY pod_pdfs_select_org ON storage.objects FOR SELECT TO authenticated
  USING (
  bucket_id = 'pod-pdfs'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'))
      )
    )
  );

DROP POLICY IF EXISTS pod_pdfs_insert_org ON storage.objects;
CREATE POLICY pod_pdfs_insert_org ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
  bucket_id = 'pod-pdfs'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'))
      )
    )
  );

DROP POLICY IF EXISTS pod_pdfs_update_org ON storage.objects;
CREATE POLICY pod_pdfs_update_org ON storage.objects FOR UPDATE TO authenticated
  USING (
  bucket_id = 'pod-pdfs'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'))
      )
    )
  )
  WITH CHECK (
  bucket_id = 'pod-pdfs'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'))
      )
    )
  );

DROP POLICY IF EXISTS pod_pdfs_delete_org ON storage.objects;
CREATE POLICY pod_pdfs_delete_org ON storage.objects FOR DELETE TO authenticated
  USING (
  bucket_id = 'pod-pdfs'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.manage'))
      )
    )
  );

-- ── pod-photos ──────────────────────────────────────────────────
DROP POLICY IF EXISTS pod_photos_select_org ON storage.objects;
CREATE POLICY pod_photos_select_org ON storage.objects FOR SELECT TO authenticated
  USING (
  bucket_id = 'pod-photos'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'))
      )
    )
  );

DROP POLICY IF EXISTS pod_photos_insert_org ON storage.objects;
CREATE POLICY pod_photos_insert_org ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
  bucket_id = 'pod-photos'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'))
      )
    )
  );

DROP POLICY IF EXISTS pod_photos_update_org ON storage.objects;
CREATE POLICY pod_photos_update_org ON storage.objects FOR UPDATE TO authenticated
  USING (
  bucket_id = 'pod-photos'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'))
      )
    )
  )
  WITH CHECK (
  bucket_id = 'pod-photos'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'))
      )
    )
  );

DROP POLICY IF EXISTS pod_photos_delete_org ON storage.objects;
CREATE POLICY pod_photos_delete_org ON storage.objects FOR DELETE TO authenticated
  USING (
  bucket_id = 'pod-photos'
    AND (
      public.is_super_admin()
      OR (
        split_part(name, '/', 1) = (public.user_org_id())::text
        AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.manage'))
      )
    )
  );
