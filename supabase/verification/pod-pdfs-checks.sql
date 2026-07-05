-- =====================================================================
-- Verification for 20260630100300_phase1_pod_pdfs_private_org_scoped
-- =====================================================================
-- Run against the live DB. Read-only except the wrapped negative test.

-- (A) Bucket exists and is PRIVATE (expect public = false).
SELECT id, public FROM storage.buckets WHERE id = 'pod-pdfs';

-- (B) The four org-scoped policies exist, authenticated-only.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN (
    'pod_pdfs_select_org','pod_pdfs_insert_org','pod_pdfs_update_org','pod_pdfs_delete_org'
  )
ORDER BY policyname;

-- (C) No object sits under a non-uuid first segment (e.g. the old "shared/"
--     prefix). Expect 0 — anything here is orphaned by the org-scoped policy
--     and should be re-homed or deleted deliberately.
SELECT count(*) AS non_org_prefixed
FROM storage.objects
WHERE bucket_id = 'pod-pdfs'
  AND split_part(name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- (D) Cross-org isolation: a member of ORG A cannot see ORG B's POD PDFs.
-- Replace <ORG_A_UID> with a real auth_user_id whose profile org differs from
-- some object's first path segment.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<ORG_A_UID>","role":"authenticated"}';
  SELECT
    count(*) FILTER (WHERE split_part(name,'/',1) = public.user_org_id()::text) AS own_org_visible,
    count(*) FILTER (WHERE split_part(name,'/',1) <> public.user_org_id()::text) AS other_org_visible
  FROM storage.objects WHERE bucket_id = 'pod-pdfs';
  -- Expect other_org_visible = 0.
ROLLBACK;
