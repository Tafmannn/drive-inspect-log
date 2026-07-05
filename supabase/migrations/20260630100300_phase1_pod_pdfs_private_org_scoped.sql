-- =====================================================================
-- Phase 1 / H3: private, org-scoped pod-pdfs bucket
-- =====================================================================
-- DEFECT: emailPodPdf uploads generated POD PDFs to a `pod-pdfs` bucket that
--   has NO migration-tracked existence or RLS. Its live ACL was unknown, and
--   the object path used a self-writable `user_metadata.org_id` that frequently
--   resolved to a shared "shared/" prefix — colliding all tenants' PODs.
--
-- FIX (paired with the client change that derives org from user_profiles):
--   * Ensure the bucket exists and is PRIVATE (idempotent; flips it private if
--     it already exists public). Signed URLs still work on a private bucket, so
--     the emailed 30-day link is unaffected.
--   * Add org-scoped RLS. Path convention is `<orgId>/<file>.pdf`, so the owning
--     org is the first path segment.
-- Reversible; no objects moved or deleted.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('pod-pdfs', 'pod-pdfs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Drop pre-existing permissive/dashboard policies for this bucket so the
-- org-scoped ones below are authoritative. RLS policies are OR'd, so any
-- bucket-only policy left behind would keep POD PDFs cross-org readable.
-- The live DB (drift-confirmed) carries these dashboard policies with NO org
-- check (USING/ WITH CHECK bucket_id='pod-pdfs') — they MUST be dropped:
DROP POLICY IF EXISTS "Authenticated users can read pod pdfs"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update pod pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload pod pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete pod pdfs" ON storage.objects;
-- Legacy/guessed names (safe no-ops if absent):
DROP POLICY IF EXISTS "Allow public read pod-pdfs"   ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload pod-pdfs" ON storage.objects;
DROP POLICY IF EXISTS "pod_pdfs_all" ON storage.objects;
-- Idempotent: drop the org-scoped names too, in case of a partial re-run.
DROP POLICY IF EXISTS "pod_pdfs_select_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_pdfs_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_pdfs_update_org" ON storage.objects;
DROP POLICY IF EXISTS "pod_pdfs_delete_org" ON storage.objects;

-- Helper predicate inlined: first path segment must be the caller's org uuid.
CREATE POLICY "pod_pdfs_select_org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'pod-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);

CREATE POLICY "pod_pdfs_insert_org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'pod-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);

-- UPDATE needed: emailPodPdf uploads with upsert=true (regenerated POD overwrites).
CREATE POLICY "pod_pdfs_update_org"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'pod-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
)
WITH CHECK (
  bucket_id = 'pod-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);

CREATE POLICY "pod_pdfs_delete_org"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'pod-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);
