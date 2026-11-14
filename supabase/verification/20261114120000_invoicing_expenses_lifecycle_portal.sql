-- =====================================================================
-- Verification queries for
--   20261114120000_invoice_expenses_and_vat_setting
--   20261114130000_invoice_lifecycle
--   20261114140000_portal_invoice_status_and_pdf
-- =====================================================================
-- Read-only. Run in the Supabase SQL editor. Section (A) BEFORE applying,
-- (B) AFTER. Behaviour is covered by supabase/tests/invoice_lifecycle.test.sql
-- (scratch database only — never run that file against production).
-- =====================================================================

-- (A) PRE-APPLY ────────────────────────────────────────────────────────

-- A1. The lifecycle migration recreates invoice_items_job_id_unique. It
--     must exist with exactly this definition, and no job may be on two
--     invoices (expect: one row / zero rows).
SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'invoice_items_job_id_unique';
SELECT job_id, count(*) FROM public.invoice_items WHERE job_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1;

-- A2. Invoices that charged VAT. Once the VAT switch exists it defaults to
--     OFF; review any row here if the business is not VAT registered.
SELECT invoice_number, issue_date, vat_rate, vat_amount, total, status, sent_at
FROM public.invoices WHERE COALESCE(vat_amount, 0) <> 0 ORDER BY issue_date;

-- A3. Invoice statuses today (expect: all 'draft' — nothing ever moved them).
SELECT status, count(*) FROM public.invoices GROUP BY 1;

-- A4. Names this change introduces must not already exist (expect: no rows).
SELECT 'table' AS kind, tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoice_expenses'
UNION ALL
SELECT 'function', proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND proname IN ('cancel_invoice', 'allocate_credit_note_number', 'invoices_guard_lifecycle', 'invoice_lines_guard_lifecycle', 'portal_can_read_invoice_pdf');

-- (B) POST-APPLY ───────────────────────────────────────────────────────

-- B1. VAT is off for every organisation until someone turns it on.
SELECT name, vat_registered FROM public.organisations ORDER BY name;

-- B2. New invoices no longer default to 20% VAT (expect: 0).
SELECT column_default FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'vat_rate';

-- B3. Double-billing guards (expect: both indexes, each "... AND (NOT voided)").
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND indexname IN ('invoice_items_job_id_unique', 'invoice_expenses_expense_id_unique');

-- B4. invoice_expenses is RLS-protected with the four admin-scoped policies.
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.invoice_expenses'::regclass;
SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoice_expenses' ORDER BY cmd;

-- B5. Lifecycle triggers are in place (expect three rows).
SELECT tgname, tgrelid::regclass FROM pg_trigger
WHERE NOT tgisinternal AND tgname LIKE 'trg_invoice%guard_lifecycle' ORDER BY 1;

-- B6. Function privileges: callable by authenticated, never by anon.
SELECT routine_name, grantee, privilege_type FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('cancel_invoice', 'allocate_credit_note_number', 'portal_can_read_invoice_pdf', 'portal_list_invoices', 'portal_get_invoice')
ORDER BY 1, 2;

-- B7. The portal's storage policy exists and is limited to invoice-pdfs.
SELECT policyname, cmd, roles, qual FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'invoice_pdfs_select_portal_client';

-- B8. Existing invoices are untouched: same count and totals as in A3,
--     all still editable drafts, none voided.
SELECT status, document_type, count(*), sum(total) FROM public.invoices GROUP BY 1, 2;
SELECT count(*) FILTER (WHERE voided) AS voided_items, count(*) AS items FROM public.invoice_items;
