-- =====================================================================
-- ROLLBACK for 20260630100300_phase1_pod_pdfs_private_org_scoped
-- =====================================================================
-- Drops the org-scoped policies. Leaves the bucket private (does NOT re-open it
-- to public) and does NOT delete the bucket or any objects — reverting to a
-- public POD bucket is never a safe automatic action. If a prior deploy truly
-- required public POD PDFs, re-enable that explicitly and deliberately.
-- =====================================================================

DROP POLICY IF EXISTS "pod_pdfs_select_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_pdfs_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_pdfs_update_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_pdfs_delete_org" ON storage.objects;
