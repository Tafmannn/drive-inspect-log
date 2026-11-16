-- =====================================================================
-- Behaviour tests for
--   20261114120000_invoice_expenses_and_vat_setting.sql
--   20261114130000_invoice_lifecycle.sql
--
-- Run ONLY against a scratch database that has the schema + both
-- migrations applied. It inserts fixture rows and is not wrapped in a
-- rollback. NEVER run against production.
--
-- Each block raises on failure; reaching "ALL INVOICE LIFECYCLE TESTS
-- PASSED" means every assertion held.
-- =====================================================================
\set ON_ERROR_STOP 1

-- ── fixtures (as superuser) ────────────────────────────────────────────
INSERT INTO organisations (id, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Org A'),
  ('00000000-0000-0000-0000-0000000000b1', 'Org B');
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-00000000aaaa'),  -- admin, org A
  ('00000000-0000-0000-0000-00000000dddd'),  -- driver, org A
  ('00000000-0000-0000-0000-00000000bbbb');  -- admin, org B
INSERT INTO user_profiles (auth_user_id, org_id, role) VALUES
  ('00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000000a1', 'admin'),
  ('00000000-0000-0000-0000-00000000dddd', '00000000-0000-0000-0000-0000000000a1', 'driver'),
  ('00000000-0000-0000-0000-00000000bbbb', '00000000-0000-0000-0000-0000000000b1', 'admin');
INSERT INTO clients (id, org_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Client A');
INSERT INTO jobs (id, org_id, client_id, total_price) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 100),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 150);
INSERT INTO expenses (id, org_id, job_id, amount, category) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000101', 54.60, 'Fuel'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000102', 8.90, 'Tolls');

-- Helper: act as an authenticated user.
CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid, false);
  EXECUTE 'SET ROLE authenticated';
END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_like text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE p_like THEN RETURN; END IF;
    RAISE EXCEPTION 'TEST FAILED [%]: wrong error: %', p_label, SQLERRM;
  END;
  RAISE EXCEPTION 'TEST FAILED [%]: statement succeeded but should have been refused', p_label;
END $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- ── 1. defaults: VAT is OFF unless switched on ─────────────────────────
DO $$
BEGIN
  ASSERT (SELECT bool_and(NOT vat_registered) FROM organisations), 'orgs must default to not VAT registered';
  ASSERT (SELECT column_default FROM information_schema.columns
           WHERE table_name = 'invoices' AND column_name = 'vat_rate') = '0', 'invoices.vat_rate default must be 0';
END $$;

-- ── 2. admin creates a draft invoice with items + expenses ─────────────
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000aaaa');
INSERT INTO invoices (id, org_id, client_id, client_name, invoice_number, subtotal, total, expenses_total, vat_registered)
VALUES ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000c1', 'Client A', 'AX26-2001', 313.50, 313.50, 63.50, false);
INSERT INTO invoice_items (invoice_id, job_id, amount) VALUES
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000101', 100),
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-000000000102', 150);
INSERT INTO invoice_expenses (invoice_id, expense_id, job_id, ref, expense_date, category, amount_gross, amount_charged) VALUES
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000101', 'R01', CURRENT_DATE, 'Fuel', 54.60, 54.60),
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000102', 'R02', CURRENT_DATE, 'Tolls', 8.90, 8.90);

-- ── 3. double-billing guards ───────────────────────────────────────────
INSERT INTO invoices (id, org_id, client_name, invoice_number)
VALUES ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-0000000000a1', 'Client A', 'AX26-2002');
SELECT pg_temp.expect_error(
  $q$INSERT INTO invoice_expenses (invoice_id, expense_id, ref, expense_date, category, amount_gross, amount_charged)
     VALUES ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-0000000000e1', 'R01', CURRENT_DATE, 'Fuel', 54.60, 54.60)$q$,
  '%invoice_expenses_expense_id_unique%', 'same expense on two invoices');
SELECT pg_temp.expect_error(
  $q$INSERT INTO invoice_items (invoice_id, job_id) VALUES ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-000000000101')$q$,
  '%invoice_items_job_id_unique%', 'same job on two invoices');

-- ── 4. RLS: driver and other-org admin cannot write; other org cannot read
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000dddd');
SELECT pg_temp.expect_error(
  $q$INSERT INTO invoice_expenses (invoice_id, ref, expense_date, category, amount_gross, amount_charged)
     VALUES ('00000000-0000-0000-0000-000000000f02', 'R09', CURRENT_DATE, 'Fuel', 1, 1)$q$,
  '%row-level security%', 'driver cannot add invoice expenses');
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM invoice_expenses) = 2, 'driver in the same org can read invoice expenses';
END $$;
SELECT pg_temp.expect_error(
  $q$SELECT cancel_invoice('00000000-0000-0000-0000-000000000f01', 'nope')$q$,
  '%only admins%', 'driver cannot cancel');
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000bbbb');
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM invoice_expenses) = 0, 'other org must not see invoice expenses';
END $$;
SELECT pg_temp.expect_error(
  $q$SELECT cancel_invoice('00000000-0000-0000-0000-000000000f01', 'nope')$q$,
  '%not found%', 'other-org admin cannot cancel');

-- ── 5. a draft is free to edit; stamping sent_at issues it ─────────────
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000aaaa');
UPDATE invoices SET notes = 'edited while draft' WHERE id = '00000000-0000-0000-0000-000000000f01';
RESET ROLE;  -- the edge function stamps sent_at with the service role
UPDATE invoices SET sent_at = now() WHERE id = '00000000-0000-0000-0000-000000000f01';
DO $$ BEGIN
  ASSERT (SELECT status FROM invoices WHERE id = '00000000-0000-0000-0000-000000000f01') = 'sent', 'sent_at must move draft -> sent';
END $$;

-- ── 6. issued invoice: contents frozen, cannot be deleted ──────────────
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000aaaa');
SELECT pg_temp.expect_error($q$UPDATE invoices SET total = 1 WHERE id = '00000000-0000-0000-0000-000000000f01'$q$, '%cannot be changed%', 'total frozen');
SELECT pg_temp.expect_error($q$UPDATE invoices SET client_name = 'X' WHERE id = '00000000-0000-0000-0000-000000000f01'$q$, '%cannot be changed%', 'client frozen');
SELECT pg_temp.expect_error($q$UPDATE invoices SET notes = 'X' WHERE id = '00000000-0000-0000-0000-000000000f01'$q$, '%cannot be changed%', 'notes frozen');
SELECT pg_temp.expect_error($q$UPDATE invoices SET status = 'draft' WHERE id = '00000000-0000-0000-0000-000000000f01'$q$, '%cannot return to draft%', 'no way back to draft');
SELECT pg_temp.expect_error($q$DELETE FROM invoices WHERE id = '00000000-0000-0000-0000-000000000f01'$q$, '%cannot be deleted%', 'issued invoice delete');
SELECT pg_temp.expect_error($q$UPDATE invoice_items SET amount = 1 WHERE invoice_id = '00000000-0000-0000-0000-000000000f01'$q$, '%lines cannot be changed%', 'items frozen');
SELECT pg_temp.expect_error($q$DELETE FROM invoice_expenses WHERE invoice_id = '00000000-0000-0000-0000-000000000f01'$q$, '%lines cannot be changed%', 'expense lines frozen');
SELECT pg_temp.expect_error(
  $q$INSERT INTO invoice_items (invoice_id, description) VALUES ('00000000-0000-0000-0000-000000000f01', 'sneaky')$q$,
  '%lines cannot be changed%', 'no new lines on issued invoice');

-- ── 7. lifecycle fields still work: stored PDF, paid, back to sent ─────
UPDATE invoices SET pdf_url = 'a1/AXENTRA_INV_AX26-2001.pdf' WHERE id = '00000000-0000-0000-0000-000000000f01';
UPDATE invoices SET status = 'paid', paid_at = CURRENT_DATE, payment_method = 'bank_transfer' WHERE id = '00000000-0000-0000-0000-000000000f01';
UPDATE invoices SET status = 'sent', paid_at = NULL, payment_method = NULL WHERE id = '00000000-0000-0000-0000-000000000f01';

-- ── 8. deleting an invoiced expense keeps the invoice line (snapshot) ──
RESET ROLE;
DELETE FROM expenses WHERE id = '00000000-0000-0000-0000-0000000000e2';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM invoice_expenses WHERE invoice_id = '00000000-0000-0000-0000-000000000f01') = 2, 'line must survive expense deletion';
  ASSERT (SELECT expense_id IS NULL AND amount_charged = 8.90 FROM invoice_expenses WHERE ref = 'R02'), 'snapshot must be intact';
END $$;

-- ── 9. cancelling an issued invoice raises a credit note + releases ────
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000aaaa');
SELECT pg_temp.expect_error($q$SELECT cancel_invoice('00000000-0000-0000-0000-000000000f01', '  ')$q$, '%reason is required%', 'reason required');
DO $$
DECLARE v_cn uuid; r record;
BEGIN
  v_cn := cancel_invoice('00000000-0000-0000-0000-000000000f01', 'Wrong client ref');
  ASSERT v_cn IS NOT NULL, 'issued invoice must get a credit note';
  SELECT * INTO r FROM invoices WHERE id = v_cn;
  ASSERT r.document_type = 'credit_note' AND r.status = 'sent' AND r.sent_at IS NOT NULL, 'credit note is issued';
  ASSERT r.total = -313.50 AND r.expenses_total = -63.50, 'credit note negates the invoice';
  ASSERT r.invoice_number = 'CN' || to_char(now(), 'YY') || '-0001', 'credit note number: ' || r.invoice_number;
  ASSERT r.credits_invoice_id = '00000000-0000-0000-0000-000000000f01', 'credit note links to invoice';
  ASSERT (SELECT status = 'cancelled' AND cancel_reason = 'Wrong client ref' FROM invoices WHERE id = '00000000-0000-0000-0000-000000000f01'), 'original cancelled';
  ASSERT (SELECT bool_and(voided) FROM invoice_items WHERE invoice_id = '00000000-0000-0000-0000-000000000f01'), 'items voided';
  ASSERT (SELECT bool_and(voided) FROM invoice_expenses WHERE invoice_id = '00000000-0000-0000-0000-000000000f01'), 'expense lines voided';
END $$;
SELECT pg_temp.expect_error($q$SELECT cancel_invoice('00000000-0000-0000-0000-000000000f01', 'again')$q$, '%already cancelled%', 'cannot cancel twice');
SELECT pg_temp.expect_error($q$UPDATE invoices SET status = 'sent' WHERE id = '00000000-0000-0000-0000-000000000f01'$q$, '%cannot be reopened%', 'cancelled stays cancelled');
SELECT pg_temp.expect_error(
  $q$SELECT cancel_invoice((SELECT id FROM invoices WHERE document_type = 'credit_note'), 'x')$q$,
  '%credit note cannot be cancelled%', 'credit note cannot be cancelled');

-- released: the same job + expense can go on the (still draft) second invoice
INSERT INTO invoice_items (invoice_id, job_id, amount) VALUES ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-000000000101', 100);
INSERT INTO invoice_expenses (invoice_id, expense_id, job_id, ref, expense_date, category, amount_gross, amount_charged)
VALUES ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000101', 'R01', CURRENT_DATE, 'Fuel', 54.60, 54.60);

-- ── 10. cancelling a draft: no credit note; a draft can also be deleted ─
DO $$ BEGIN
  ASSERT cancel_invoice('00000000-0000-0000-0000-000000000f02', 'Created by mistake') IS NULL, 'draft needs no credit note';
  ASSERT (SELECT count(*) FROM invoices WHERE document_type = 'credit_note') = 1, 'still exactly one credit note';
END $$;
INSERT INTO invoices (id, org_id, client_name, invoice_number)
VALUES ('00000000-0000-0000-0000-000000000f03', '00000000-0000-0000-0000-0000000000a1', 'Client A', 'AX26-2003');
INSERT INTO invoice_items (invoice_id, job_id) VALUES ('00000000-0000-0000-0000-000000000f03', '00000000-0000-0000-0000-000000000102');
DELETE FROM invoices WHERE id = '00000000-0000-0000-0000-000000000f03';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM invoice_items WHERE invoice_id = '00000000-0000-0000-0000-000000000f03') = 0, 'draft delete cascades to its items';
END $$;

-- ── 11. marking a draft 'sent' directly stamps sent_at ─────────────────
INSERT INTO invoices (id, org_id, client_name, invoice_number)
VALUES ('00000000-0000-0000-0000-000000000f04', '00000000-0000-0000-0000-0000000000a1', 'Client A', 'AX26-2004');
UPDATE invoices SET status = 'sent' WHERE id = '00000000-0000-0000-0000-000000000f04';
DO $$ BEGIN
  ASSERT (SELECT sent_at IS NOT NULL FROM invoices WHERE id = '00000000-0000-0000-0000-000000000f04'), 'manual mark-as-sent stamps sent_at';
END $$;

RESET ROLE;
SELECT 'ALL INVOICE LIFECYCLE TESTS PASSED' AS result;

-- =====================================================================
-- 20261114140000_portal_invoice_status_and_pdf.sql
-- =====================================================================
-- fixtures: two portal users (one per client), an invoice-pdfs object each
INSERT INTO clients (id, org_id, name) VALUES
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'Client Two');
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-00000000c1c1'), ('00000000-0000-0000-0000-00000000c2c2');
INSERT INTO user_profiles (auth_user_id, org_id, role, client_id) VALUES
  ('00000000-0000-0000-0000-00000000c1c1', NULL, 'client', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-00000000c2c2', NULL, 'client', '00000000-0000-0000-0000-0000000000c2');
INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-pdfs', 'invoice-pdfs', false);
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('invoice-pdfs', 'a1/AXENTRA_INV_AX26-2001.pdf'),   -- AX26-2001: client 1, sent then cancelled
  ('invoice-pdfs', 'a1/AXENTRA_INV_AX26-2010.pdf'),   -- AX26-2010: client 1, still a draft
  ('invoice-pdfs', 'a1/AXENTRA_INV_AX26-2011.pdf');   -- AX26-2011: client 2, sent
INSERT INTO invoices (id, org_id, client_id, client_name, invoice_number, pdf_url, status) VALUES
  ('00000000-0000-0000-0000-000000000f10', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Client A', 'AX26-2010', 'a1/AXENTRA_INV_AX26-2010.pdf', 'draft'),
  ('00000000-0000-0000-0000-000000000f11', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c2', 'Client Two', 'AX26-2011', 'a1/AXENTRA_INV_AX26-2011.pdf', 'draft');
UPDATE invoices SET sent_at = now() WHERE id = '00000000-0000-0000-0000-000000000f11';
GRANT SELECT ON storage.objects TO authenticated;

-- ── 12. portal user sees own sent invoices with status + credit note ───
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000c1c1');
DO $$
DECLARE v jsonb := portal_list_invoices(); d jsonb;
BEGIN
  ASSERT jsonb_array_length(v) = 2, 'client 1 sees the cancelled invoice and its credit note, not the draft: ' || v::text;
  ASSERT (SELECT count(*) FROM jsonb_array_elements(v) e WHERE e->>'status' = 'cancelled' AND e->>'document_type' = 'invoice') = 1, 'cancelled invoice carries its status';
  ASSERT (SELECT count(*) FROM jsonb_array_elements(v) e WHERE e->>'document_type' = 'credit_note') = 1, 'credit note is labelled';
  d := portal_get_invoice('00000000-0000-0000-0000-000000000f01');
  ASSERT d->>'status' = 'cancelled' AND d->>'pdf_path' = 'a1/AXENTRA_INV_AX26-2001.pdf' AND (d->>'vat_registered')::boolean = false, 'detail fields: ' || d::text;
  d := portal_get_invoice((SELECT (e->>'id')::uuid FROM jsonb_array_elements(v) e WHERE e->>'document_type' = 'credit_note'));
  ASSERT d->>'credits_invoice_number' = 'AX26-2001', 'credit note names the invoice it credits';
END $$;
SELECT pg_temp.expect_error($q$SELECT portal_get_invoice('00000000-0000-0000-0000-000000000f10')$q$, '%NOT_FOUND%', 'portal cannot open a draft');
SELECT pg_temp.expect_error($q$SELECT portal_get_invoice('00000000-0000-0000-0000-000000000f11')$q$, '%NOT_FOUND%', 'portal cannot open another client''s invoice');

-- ── 13. storage: only the PDF of the caller's own SENT invoice ─────────
DO $$ BEGIN
  ASSERT (SELECT array_agg(name ORDER BY name) FROM storage.objects) = ARRAY['a1/AXENTRA_INV_AX26-2001.pdf'],
    'client 1 may read only its own sent invoice PDF, got: ' || COALESCE((SELECT string_agg(name, ', ') FROM storage.objects), '(none)');
END $$;
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000c2c2');
DO $$ BEGIN
  ASSERT (SELECT array_agg(name ORDER BY name) FROM storage.objects) = ARRAY['a1/AXENTRA_INV_AX26-2011.pdf'], 'client 2 may read only its own';
END $$;
-- a driver (no portal client) gets nothing from this policy
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000dddd');
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM storage.objects) = 0, 'non-portal users get no access via the portal policy';
END $$;
SELECT pg_temp.expect_error($q$SELECT portal_list_invoices()$q$, '%PORTAL_ACCESS_DENIED%', 'non-portal user cannot list portal invoices');

RESET ROLE;
SELECT 'ALL PORTAL INVOICE TESTS PASSED' AS result;
