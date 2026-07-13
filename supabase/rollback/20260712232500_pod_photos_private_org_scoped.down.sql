-- =====================================================================
-- ROLLBACK for 20260712232500_pod_photos_private_org_scoped
-- =====================================================================
-- Drops the org-scoped policies. Leaves the bucket private (does NOT re-open
-- it to public) and does NOT delete the bucket or any objects — reverting to
-- a public bucket is never a safe automatic action. Mirrors the sibling
-- pod-pdfs rollback (20260630100300_phase1_pod_pdfs_private_org_scoped.down.sql).
-- =====================================================================

DROP POLICY IF EXISTS "pod_photos_select_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_photos_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_photos_update_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_photos_delete_org" ON storage.objects;
