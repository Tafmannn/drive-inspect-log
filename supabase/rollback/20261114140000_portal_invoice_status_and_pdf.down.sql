-- Rollback for 20261114140000_portal_invoice_status_and_pdf.sql
-- Removes the portal's read access to stored invoice PDFs. The two portal_*
-- functions are left in place: their extra fields are ignored by the older
-- frontend, and restoring the previous bodies would need
-- 20261030120000_client_portal.sql re-applied.
DROP POLICY IF EXISTS "invoice_pdfs_select_portal_client" ON storage.objects;
DROP FUNCTION IF EXISTS public.portal_can_read_invoice_pdf(text);
