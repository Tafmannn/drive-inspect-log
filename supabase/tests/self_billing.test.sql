-- =====================================================================
-- Behaviour tests for 20261127200000_client_self_billing.sql
--
-- Run ONLY against a disposable database with the schema + migration
-- applied. Everything runs in one transaction that is rolled back at the
-- end. NEVER run against production. Reaching "ALL SELF-BILLING TESTS
-- PASSED" means every assertion held.
-- =====================================================================
\set ON_ERROR_STOP 1
BEGIN;

-- ── fixtures (as superuser) ────────────────────────────────────────────
INSERT INTO organisations (id, name) VALUES
  ('00000000-0000-0000-0000-0000000005a1', 'SB Org A'),
  ('00000000-0000-0000-0000-0000000005b1', 'SB Org B');
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-00000005aaaa'),  -- admin, org A
  ('00000000-0000-0000-0000-00000005dddd'),  -- driver, org A
  ('00000000-0000-0000-0000-00000005bbbb');  -- admin, org B
INSERT INTO user_profiles (auth_user_id, email, org_id, role, account_status) VALUES
  ('00000000-0000-0000-0000-00000005aaaa', 'admin-a@sb-test.invalid', '00000000-0000-0000-0000-0000000005a1', 'admin', 'active'),
  ('00000000-0000-0000-0000-00000005dddd', 'driver-a@sb-test.invalid', '00000000-0000-0000-0000-0000000005a1', 'driver', 'active'),
  ('00000000-0000-0000-0000-00000005bbbb', 'admin-b@sb-test.invalid', '00000000-0000-0000-0000-0000000005b1', 'admin', 'active')
 ON CONFLICT (auth_user_id) DO UPDATE
  SET email = EXCLUDED.email, org_id = EXCLUDED.org_id, role = EXCLUDED.role, account_status = EXCLUDED.account_status;

-- c1 self-bills (Movex-like); c2 is invoiced by us.
INSERT INTO clients (id, org_id, name, company, billing_method) VALUES
  ('00000000-0000-0000-0000-0000000005c1', '00000000-0000-0000-0000-0000000005a1', 'Movex', 'Movex', 'self_billed'),
  ('00000000-0000-0000-0000-0000000005c2', '00000000-0000-0000-0000-0000000005a1', 'Revillo', 'Revillo', 'we_invoice');

INSERT INTO jobs (id, org_id, client_id, status, external_job_number, vehicle_reg, vehicle_make, vehicle_model, vehicle_colour,
  pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_city, pickup_postcode,
  delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_city, delivery_postcode)
SELECT v.id::uuid, '00000000-0000-0000-0000-0000000005a1', v.client::uuid, v.status, v.ref, v.reg, 'Test', 'Car', 'Grey',
  'P', '07000000000', '1 Pickup St', 'Leeds', 'LS1 1AA', 'D', '07000000001', '2 Delivery Rd', 'York', 'YO1 1AA'
FROM (VALUES
  ('00000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-0000000005c1', 'completed', 'SB101', 'SB01 AAA'),
  ('00000000-0000-0000-0000-000000005102', '00000000-0000-0000-0000-0000000005c1', 'completed', 'SB102', 'SB02 AAA'),
  ('00000000-0000-0000-0000-000000005103', '00000000-0000-0000-0000-0000000005c1', 'assigned',  'SB103', 'SB03 AAA'),
  ('00000000-0000-0000-0000-000000005104', '00000000-0000-0000-0000-0000000005c1', 'completed', 'SB104', 'SB04 AAA'),
  ('00000000-0000-0000-0000-000000005201', '00000000-0000-0000-0000-0000000005c2', 'completed', 'RV201', 'RV01 AAA')
) AS v(id, client, status, ref, reg);

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
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
GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text, text) TO authenticated;

-- ── 1. defaults: every existing / new client is invoiced by us ─────────
DO $$
BEGIN
  ASSERT (SELECT column_default FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'billing_method') = '''we_invoice''::text',
    'clients.billing_method must default to we_invoice';
  ASSERT (SELECT column_default FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'self_billed') = 'false',
    'invoices.self_billed must default to false';
END $$;
SELECT pg_temp.expect_error(
  $$UPDATE clients SET billing_method = 'sometimes' WHERE id = '00000000-0000-0000-0000-0000000005c1'$$,
  '%clients_billing_method_check%', 'billing_method allowed values');

-- ── 2. admin records Movex's paid invoice ──────────────────────────────
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000005aaaa');
DO $$
DECLARE v_id uuid; v_inv invoices%ROWTYPE;
BEGIN
  v_id := record_self_billed_invoice(
    '00000000-0000-0000-0000-0000000005c1', ' MVX-7781 ', current_date - 3, current_date - 1,
    '[{"job_id":"00000000-0000-0000-0000-000000005101","amount":110},{"job_id":"00000000-0000-0000-0000-000000005102","amount":95.555}]'::jsonb,
    '00000000-0000-0000-0000-0000000005a1/self-billed/x/movex.pdf', 'BACS 123', 'Paid via Movex app');
  SELECT * INTO v_inv FROM invoices WHERE id = v_id;
  ASSERT v_inv.self_billed, 'record must be flagged self_billed';
  ASSERT v_inv.status = 'paid' AND v_inv.sent_at IS NOT NULL, 'record must be issued and paid';
  ASSERT v_inv.paid_at = current_date - 1 AND v_inv.issue_date = current_date - 3, 'dates kept';
  ASSERT v_inv.invoice_number = 'MVX-7781', 'their number is stored, trimmed';
  ASSERT v_inv.total = 205.56 AND v_inv.subtotal = 205.56 AND v_inv.vat_amount = 0, 'total = sum of rounded line amounts';
  ASSERT v_inv.payment_reference = 'BACS 123' AND v_inv.pdf_url LIKE '%/self-billed/%', 'reference + their PDF kept';
  ASSERT jsonb_array_length(v_inv.line_items) = 2, 'one line per job';
  ASSERT (SELECT count(*) FROM invoice_items WHERE invoice_id = v_id AND NOT voided) = 2, 'invoice_items written';
END $$;

-- ── 3. refusals ────────────────────────────────────────────────────────
-- a job already on a live invoice
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-7782', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005101","amount":110}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%JOB_ALREADY_INVOICED%', 'job already invoiced');
-- the same invoice number twice
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-7781', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005104","amount":1}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%SELF_BILL_NUMBER_IN_USE%', 'duplicate number');
-- a client we invoice ourselves
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c2', 'X-1', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005201","amount":100}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%CLIENT_NOT_SELF_BILLING%', 'we_invoice client');
-- a job of another client
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-9', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005201","amount":100}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%SELF_BILL_JOB_NOT_THIS_CLIENT%', 'other client job');
-- a job still in progress
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-10', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005103","amount":100}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%SELF_BILL_JOB_NOT_BILLABLE%', 'job not finished');
-- zero / missing amounts, no PDF, a PDF outside the org's folder, future dates
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-11', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005102","amount":0}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%SELF_BILL_LINE_INVALID%', 'zero amount');
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-12', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005102","amount":5}]'::jsonb, '')$$,
  '%SELF_BILL_PDF_REQUIRED%', 'no pdf');
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-13', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005102","amount":5}]'::jsonb,
     '00000000-0000-0000-0000-0000000005b1/self-billed/y/a.pdf')$$,
  '%SELF_BILL_PDF_REQUIRED%', 'pdf in another org folder');
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-14', current_date + 1, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005102","amount":5}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%SELF_BILL_DATE_INVALID%', 'future invoice date');

-- ── 4. the flag can't be forged or flipped directly ────────────────────
SELECT pg_temp.expect_error(
  $$INSERT INTO invoices (org_id, client_id, client_name, invoice_number, self_billed)
    VALUES ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005c1', 'Movex', 'FORGED-1', true)$$,
  '%SELF_BILL_DIRECT_WRITE_DENIED%', 'direct insert of a self-billed invoice');
SELECT pg_temp.expect_error(
  $$UPDATE invoices SET self_billed = false WHERE invoice_number = 'MVX-7781'$$,
  '%SELF_BILL_FLAG_IMMUTABLE%', 'flip the flag');

-- ── 5. who may record ──────────────────────────────────────────────────
RESET ROLE;
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000005dddd');
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-20', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005102","amount":5}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%ADMIN_REQUIRED%', 'driver');
RESET ROLE;
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000005bbbb');
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-21', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005102","amount":5}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%CLIENT_NOT_FOUND%', 'admin of another org');
RESET ROLE;

-- ── 6. a VAT-registered org is refused rather than mis-recorded ────────
UPDATE organisations SET vat_registered = true WHERE id = '00000000-0000-0000-0000-0000000005a1';
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000005aaaa');
SELECT pg_temp.expect_error(
  $$SELECT record_self_billed_invoice('00000000-0000-0000-0000-0000000005c1', 'MVX-30', current_date, current_date,
     '[{"job_id":"00000000-0000-0000-0000-000000005102","amount":5}]'::jsonb,
     '00000000-0000-0000-0000-0000000005a1/self-billed/y/a.pdf')$$,
  '%SELF_BILL_VAT_NOT_SUPPORTED%', 'vat registered org');
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'ALL SELF-BILLING TESTS PASSED'; END $$;
ROLLBACK;
