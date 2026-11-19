-- =====================================================================
-- invoice-pdfs bucket: private, org-scoped storage for invoice PDFs
-- =====================================================================
-- Invoices gained an email-to-client flow: the PDF is generated
-- client-side, uploaded here, and the email carries a 30-day signed
-- download link — the exact pattern pod-pdfs already uses
-- (20260630100300_phase1_pod_pdfs_private_org_scoped). Private bucket,
-- org-scoped RLS keyed off the first path segment (`<orgId>/<file>.pdf`).
-- Writes are effectively admin-only in practice (the invoicing UI is
-- admin-gated); the storage policy scopes by org like its siblings.
-- Reversible; no objects moved or deleted.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "invoice_pdfs_select_org" ON storage.objects;
DROP POLICY IF EXISTS "invoice_pdfs_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "invoice_pdfs_update_org" ON storage.objects;
DROP POLICY IF EXISTS "invoice_pdfs_delete_org" ON storage.objects;

CREATE POLICY "invoice_pdfs_select_org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoice-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);

CREATE POLICY "invoice_pdfs_insert_org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'invoice-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);

-- UPDATE needed: upload uses upsert=true (re-emailing overwrites the PDF).
CREATE POLICY "invoice_pdfs_update_org"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'invoice-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
)
WITH CHECK (
  bucket_id = 'invoice-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);

CREATE POLICY "invoice_pdfs_delete_org"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'invoice-pdfs'
  AND (
    public.is_super_admin()
    OR split_part(storage.objects.name, '/', 1) = public.user_org_id()::text
  )
);
