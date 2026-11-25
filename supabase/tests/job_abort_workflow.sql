-- Scenario test for 20261123100000_job_abort_workflow.sql.
--
-- Runs as one transaction and ROLLS BACK, so it leaves nothing behind. Run it only against a
-- local or staging database that has the migration applied — never production:
--   psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/job_abort_workflow.sql
-- Every check raises on failure; the last line printed is "ABORT WORKFLOW: ALL CHECKS PASSED".
--
-- Users are simulated the way PostgREST does it: SET ROLE authenticated + request.jwt.claim.sub.

\set QUIET on
BEGIN;

CREATE FUNCTION pg_temp.expect_error(p_sql text, p_pattern text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
    v_ok := true;
  EXCEPTION WHEN others THEN
    IF SQLERRM !~ p_pattern THEN
      RAISE EXCEPTION 'expected error matching "%", got "%" for: %', p_pattern, SQLERRM, p_sql;
    END IF;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'expected error matching "%" but it succeeded: %', p_pattern, p_sql;
  END IF;
END $$;

CREATE FUNCTION pg_temp.check(p_ok boolean, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'CHECK FAILED: %', p_what; END IF;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.expect_error(text, text), pg_temp.check(boolean, text) TO authenticated;

-- ── fixtures (as the table owner) ────────────────────────────────────────────
INSERT INTO public.organisations (id, name) VALUES
  ('a1b00000-0000-0000-0000-000000000001', 'Abort Test Org 1'),
  ('a1b00000-0000-0000-0000-000000000002', 'Abort Test Org 2');

INSERT INTO auth.users (id, email) VALUES
  ('b1b00000-0000-0000-0000-000000000001', 'admin1@abort.test'),
  ('b1b00000-0000-0000-0000-000000000002', 'super@abort.test'),
  ('b1b00000-0000-0000-0000-000000000003', 'driver1@abort.test'),
  ('b1b00000-0000-0000-0000-000000000004', 'driver2@abort.test'),
  ('b1b00000-0000-0000-0000-000000000005', 'admin2@abort.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_profiles (auth_user_id, email, org_id, role, account_status) VALUES
  ('b1b00000-0000-0000-0000-000000000001', 'admin1@abort.test',  'a1b00000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('b1b00000-0000-0000-0000-000000000002', 'super@abort.test',   'a1b00000-0000-0000-0000-000000000001', 'super_admin', 'active'),
  ('b1b00000-0000-0000-0000-000000000003', 'driver1@abort.test', 'a1b00000-0000-0000-0000-000000000001', 'driver', 'active'),
  ('b1b00000-0000-0000-0000-000000000004', 'driver2@abort.test', 'a1b00000-0000-0000-0000-000000000001', 'driver', 'active'),
  ('b1b00000-0000-0000-0000-000000000005', 'admin2@abort.test',  'a1b00000-0000-0000-0000-000000000002', 'admin', 'active')
-- a sign-up trigger may already have created the profile from auth.users
ON CONFLICT (auth_user_id) DO UPDATE
  SET org_id = EXCLUDED.org_id, role = EXCLUDED.role, account_status = EXCLUDED.account_status;

INSERT INTO public.driver_profiles (id, org_id, user_id, full_name) VALUES
  ('d1b00000-0000-0000-0000-000000000001', 'a1b00000-0000-0000-0000-000000000001', 'b1b00000-0000-0000-0000-000000000003', 'Driver One'),
  ('d1b00000-0000-0000-0000-000000000002', 'a1b00000-0000-0000-0000-000000000001', 'b1b00000-0000-0000-0000-000000000004', 'Driver Two');

INSERT INTO public.clients (id, org_id, name) VALUES
  ('c1b00000-0000-0000-0000-000000000001', 'a1b00000-0000-0000-0000-000000000001', 'Abort Test Client');

INSERT INTO public.jobs (id, org_id, external_job_number, status, driver_id, client_id, has_pickup_inspection,
  current_run_id, vehicle_reg, vehicle_make, vehicle_model, vehicle_colour,
  pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_city, pickup_postcode,
  delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_city, delivery_postcode)
SELECT v.id::uuid, v.org::uuid, v.ref, v.status, v.driver::uuid, v.client::uuid, v.has_pickup,
  gen_random_uuid(), 'AB12 CDE', 'Ford', 'Focus', 'Blue',
  'P', '0', '1 A St', 'Leeds', 'LS1 1AA', 'D', '0', '2 B St', 'York', 'YO1 1AA'
FROM (VALUES
  ('e1b00000-0000-0000-0000-000000000001', 'a1b00000-0000-0000-0000-000000000001', 'ABT-1', 'assigned',        'd1b00000-0000-0000-0000-000000000001', 'c1b00000-0000-0000-0000-000000000001', false),
  ('e1b00000-0000-0000-0000-000000000002', 'a1b00000-0000-0000-0000-000000000001', 'ABT-2', 'ready_for_pickup', NULL,                                  'c1b00000-0000-0000-0000-000000000001', false),
  ('e1b00000-0000-0000-0000-000000000003', 'a1b00000-0000-0000-0000-000000000001', 'ABT-3', 'cancelled',        'd1b00000-0000-0000-0000-000000000001', NULL, false),
  ('e1b00000-0000-0000-0000-000000000004', 'a1b00000-0000-0000-0000-000000000001', 'ABT-4', 'pickup_complete',  'd1b00000-0000-0000-0000-000000000001', NULL, true),
  ('e1b00000-0000-0000-0000-000000000005', 'a1b00000-0000-0000-0000-000000000002', 'ABT-5', 'assigned',         NULL,                                  NULL, false),
  ('e1b00000-0000-0000-0000-000000000006', 'a1b00000-0000-0000-0000-000000000001', 'ABT-6', 'pickup_in_progress','d1b00000-0000-0000-0000-000000000001', NULL, false)
) AS v(id, org, ref, status, driver, client, has_pickup);

INSERT INTO public.job_pricing (job_id, org_id, total_price) VALUES
  ('e1b00000-0000-0000-0000-000000000001', 'a1b00000-0000-0000-0000-000000000001', 250.00);

-- ── 1. driver requests: one tap, idempotent, job stays active ───────────────
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000003', false); -- driver1

SELECT pg_temp.check((public.request_job_abort('e1b00000-0000-0000-0000-000000000001')->>'duplicate')::boolean = false, 'first request is new');
SELECT pg_temp.check((public.request_job_abort('e1b00000-0000-0000-0000-000000000001')->>'duplicate')::boolean = true, 'second tap returns the same pending request');
SELECT pg_temp.check((SELECT count(*) FROM public.job_abort_requests WHERE job_id = 'e1b00000-0000-0000-0000-000000000001') = 1, 'driver sees exactly one own request');
SELECT pg_temp.check((SELECT status FROM public.jobs WHERE id = 'e1b00000-0000-0000-0000-000000000001') = 'assigned', 'request does not change job status');
SELECT pg_temp.check((SELECT count(*) FROM public.job_aborts) = 0, 'driver cannot read abort records');

-- driver cannot confirm, cannot set the status, cannot touch other jobs or ineligible ones
SELECT pg_temp.expect_error($$SELECT public.confirm_job_abort('e1b00000-0000-0000-0000-000000000001', 'Me', false, NULL)$$, 'ADMIN_OR_SUPER_ADMIN_ONLY');
SELECT pg_temp.expect_error($$UPDATE public.jobs SET status = 'aborted' WHERE id = 'e1b00000-0000-0000-0000-000000000001'$$, 'ABORT_STATUS_PROTECTED|DRIVER_JOB_WRITE_DENIED');
SELECT pg_temp.expect_error($$SELECT public.review_job_abort_claim(gen_random_uuid(), 'approved', 1, NULL)$$, 'ADMIN_OR_SUPER_ADMIN_ONLY');
SELECT pg_temp.expect_error($$INSERT INTO public.job_aborts (org_id, job_id, from_status, contact_name, confirmed_by) VALUES ('a1b00000-0000-0000-0000-000000000001','e1b00000-0000-0000-0000-000000000001','assigned','x','b1b00000-0000-0000-0000-000000000003')$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT public.request_job_abort('e1b00000-0000-0000-0000-000000000004')$$, 'ABORT_NOT_ELIGIBLE');
SELECT pg_temp.expect_error($$SELECT public.request_job_abort('e1b00000-0000-0000-0000-000000000003')$$, 'ABORT_NOT_ELIGIBLE');

SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000004', false); -- driver2
SELECT pg_temp.expect_error($$SELECT public.request_job_abort('e1b00000-0000-0000-0000-000000000001')$$, 'ABORT_REQUEST_DENIED');
SELECT pg_temp.check((SELECT count(*) FROM public.job_abort_requests) = 0, 'driver2 cannot see driver1''s request');

-- ── 2. admin confirmation: validation, staleness, cross-org ──────────────────
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000001', false); -- admin1
SELECT pg_temp.expect_error($$UPDATE public.jobs SET status = 'aborted' WHERE id = 'e1b00000-0000-0000-0000-000000000001'$$, 'ABORT_STATUS_PROTECTED');
SELECT pg_temp.expect_error($$SELECT public.confirm_job_abort('e1b00000-0000-0000-0000-000000000001', '   ', false, NULL)$$, 'CONTACT_NAME_REQUIRED');
SELECT pg_temp.expect_error($$SELECT public.confirm_job_abort('e1b00000-0000-0000-0000-000000000001', 'Jane', false, 'ready_for_pickup')$$, 'STALE_JOB_STATE');
SELECT pg_temp.expect_error($$SELECT public.confirm_job_abort('e1b00000-0000-0000-0000-000000000003', 'Jane', false, NULL)$$, 'ABORT_NOT_ELIGIBLE');
SELECT pg_temp.expect_error($$SELECT public.confirm_job_abort('e1b00000-0000-0000-0000-000000000004', 'Jane', false, NULL)$$, 'ABORT_NOT_ELIGIBLE');

SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000005', false); -- admin2, other org
SELECT pg_temp.expect_error($$SELECT public.confirm_job_abort('e1b00000-0000-0000-0000-000000000001', 'Jane', false, NULL)$$, 'JOB_NOT_FOUND');
SELECT pg_temp.check((SELECT count(*) FROM public.job_abort_requests) = 0, 'other org sees no requests');

SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000001', false); -- admin1
SELECT pg_temp.check(
  (public.confirm_job_abort('e1b00000-0000-0000-0000-000000000001', '  Jane   Smith ', false, 'assigned')->>'alreadyAborted')::boolean = false,
  'admin confirms the Abort');
SELECT pg_temp.check((SELECT status FROM public.jobs WHERE id = 'e1b00000-0000-0000-0000-000000000001') = 'aborted', 'job is aborted');
SELECT pg_temp.check((SELECT driver_id FROM public.jobs WHERE id = 'e1b00000-0000-0000-0000-000000000001') = 'd1b00000-0000-0000-0000-000000000001', 'assignment kept for history');
SELECT pg_temp.check((SELECT contact_name = 'Jane Smith' AND NOT no_name_exception AND agreed_price = 250 AND proposed_amount = 250
                             AND approved_amount IS NULL AND finance_status = 'pending_review'
                             AND confirmed_by = 'b1b00000-0000-0000-0000-000000000001'
                             AND confirmed_at = now() AND from_status = 'assigned'
                        FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001'),
                     'abort record: normalised name, server timestamp, price snapshot, pending review');
SELECT pg_temp.check((SELECT total_price FROM public.job_pricing WHERE job_id = 'e1b00000-0000-0000-0000-000000000001') = 250, 'agreed price untouched');
SELECT pg_temp.check((SELECT status FROM public.job_abort_requests WHERE job_id = 'e1b00000-0000-0000-0000-000000000001') = 'confirmed', 'pending request resolved');
SELECT pg_temp.check((SELECT count(*) FROM public.customer_notifications WHERE job_id = 'e1b00000-0000-0000-0000-000000000001') = 0, 'no automatic customer notification');

-- second admin presses Confirm too: no second Abort, existing one reported
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000002', false); -- super admin
SELECT pg_temp.check(
  (public.confirm_job_abort('e1b00000-0000-0000-0000-000000000001', 'Someone Else', false, 'assigned')->>'alreadyAborted')::boolean,
  'second confirmation is idempotent');
SELECT pg_temp.check((SELECT count(*) FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001') = 1, 'still one Abort');

-- ── 3. lifecycle locks ───────────────────────────────────────────────────────
RESET ROLE;
SELECT pg_temp.expect_error($$UPDATE public.jobs SET status = 'pickup_complete' WHERE id = 'e1b00000-0000-0000-0000-000000000001'$$, 'ABORT_STATUS_PROTECTED');
SELECT pg_temp.expect_error($$INSERT INTO public.jobs (org_id, status, vehicle_reg, vehicle_make, vehicle_model, vehicle_colour, pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_city, pickup_postcode, delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_city, delivery_postcode) VALUES ('a1b00000-0000-0000-0000-000000000001','aborted','X','X','X','X','X','X','X','X','X','X','X','X','X','X')$$, 'ABORT_STATUS_PROTECTED');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000003', false); -- driver1
SELECT pg_temp.check(NOT public.driver_can_read_job_evidence('e1b00000-0000-0000-0000-000000000001'), 'driver loses evidence access');
SELECT pg_temp.expect_error($$SELECT public.request_job_abort('e1b00000-0000-0000-0000-000000000001')$$, 'JOB_ALREADY_ABORTED');

-- ── 4. finance: nothing billable until approved; partial amounts honoured ───
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000001', false); -- admin1
INSERT INTO public.invoices (id, org_id, invoice_number, status, subtotal, total)
VALUES ('f1b00000-0000-0000-0000-000000000001', 'a1b00000-0000-0000-0000-000000000001', 'ABT-INV-1', 'draft', 100, 100);
SELECT pg_temp.expect_error($$INSERT INTO public.invoice_items (invoice_id, job_id, description, quantity, unit_price, amount) VALUES ('f1b00000-0000-0000-0000-000000000001','e1b00000-0000-0000-0000-000000000001','x',1,250,250)$$, 'ABORT_NOT_APPROVED');

SELECT pg_temp.expect_error(format($SELECT public.review_job_abort_claim(%L, 'approved', 300, NULL)$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001')), 'CLIENT_FEE_CONFIRMATION_REQUIRED');
SELECT pg_temp.check(
  (public.review_job_abort_claim((SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001'), 'approved', 100, 'Half fee agreed', true)->>'approvedAmount')::numeric = 100,
  'partial approval stored');

-- Approval is FINAL immediately, even before an invoice exists.
-- Admin cannot re-approve or reject, and cannot call the exceptional amendment RPC.
SELECT pg_temp.expect_error(format($SELECT public.review_job_abort_claim(%L, 'approved', 150, 'Repeat approval')$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001')), 'ABORT_CLAIM_ALREADY_REVIEWED');
SELECT pg_temp.expect_error(format($SELECT public.review_job_abort_claim(%L, 'rejected', NULL, 'Changed my mind')$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001')), 'ABORT_CLAIM_ALREADY_REVIEWED');
SELECT pg_temp.expect_error(format($SELECT public.amend_approved_job_abort_claim(%L, 90, 'Customer revised their agreed fee', 100)$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001')), 'SUPER_ADMIN_ONLY');
SELECT pg_temp.check((SELECT approved_amount = 100 FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001'), 'repeat clicks do not change approved amount');
SELECT pg_temp.check((SELECT COUNT(*) = 1 FROM public.job_abort_events
  WHERE job_id = 'e1b00000-0000-0000-0000-000000000001' AND action = 'claim_approved'),
  'only one initial approval event');

-- Only Super Admin may correct an already-approved, still-uninvoiced fee.
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000002', false); -- super admin
SELECT pg_temp.expect_error(format($SELECT public.amend_approved_job_abort_claim(%L, 90, 'Short', 100, true)$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001')), 'AMENDMENT_REASON_REQUIRED');
SELECT pg_temp.expect_error(format($SELECT public.amend_approved_job_abort_claim(%L, 90, 'Customer revised the full fee', 99, true)$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001')), 'ABORT_FEE_CHANGED');
SELECT pg_temp.check(
  (public.amend_approved_job_abort_claim((SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001'),
    300, 'Customer confirmed fee above original price', 100, true)->>'approvedAmount')::numeric = 300,
  'first exceptional amendment saved above original agreed price');
SELECT pg_temp.expect_error(format($SELECT public.amend_approved_job_abort_claim(%L, 80, 'Customer revised the full fee again', 100, true)$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001')), 'ABORT_FEE_CHANGED');
SELECT pg_temp.expect_error(format($SELECT public.amend_approved_job_abort_claim(%L, 300, 'Customer revised the full fee again', 300, true)$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001')), 'ABORT_AMENDMENT_NO_CHANGE');
SELECT pg_temp.check(
  (public.amend_approved_job_abort_claim((SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001'),
    100, 'Client reverted to original agreed amount', 300, true)->>'approvedAmount')::numeric = 100,
  'second exceptional amendment saved');
SELECT pg_temp.check((SELECT count(*) = 2 FROM public.job_abort_events
  WHERE job_id = 'e1b00000-0000-0000-0000-000000000001' AND action = 'claim_amended'),
  'both amendments have audit events');
SELECT pg_temp.check((SELECT review_note = 'Half fee agreed' AND last_amended_by =
  'b1b00000-0000-0000-0000-000000000002' FROM public.job_aborts
  WHERE job_id = 'e1b00000-0000-0000-0000-000000000001'), 'original review preserved and amendment attributed');

SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000001', false); -- admin1

SELECT pg_temp.expect_error($INSERT INTO public.invoice_items (invoice_id, job_id, description, quantity, unit_price, amount) VALUES ('f1b00000-0000-0000-0000-000000000001','e1b00000-0000-0000-0000-000000000001','x',1,250,250)$, 'ABORT_AMOUNT_EXCEEDED');
INSERT INTO public.invoice_items (invoice_id, job_id, description, quantity, unit_price, amount)
VALUES ('f1b00000-0000-0000-0000-000000000001', 'e1b00000-0000-0000-0000-000000000001', 'Abort at Collection — ABT-1 — AB12 CDE', 1, 100, 100);

-- the same Abort through the other invoicing route is refused (existing one-live-invoice guard)
SELECT pg_temp.expect_error($$INSERT INTO public.invoices (org_id, invoice_number, status, job_id, subtotal, total) VALUES ('a1b00000-0000-0000-0000-000000000001','ABT-INV-2','draft','e1b00000-0000-0000-0000-000000000001',100,100)$$, 'JOB_ALREADY_INVOICED');
SELECT pg_temp.expect_error(format($$SELECT public.review_job_abort_claim(%L, 'approved', 250, NULL)$$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000001')), 'ABORT_CLAIM_INVOICED');
SELECT pg_temp.expect_error($$SELECT public.reopen_job('e1b00000-0000-0000-0000-000000000001', NULL)$$, 'ABORT_INVOICED');

-- ── 5. rebooking an invoiced Abort: a linked replacement job ────────────────
SELECT pg_temp.check((public.create_abort_replacement_job('e1b00000-0000-0000-0000-000000000001')->>'jobRef') = 'ABT-1-R1', 'replacement job created');
SELECT pg_temp.check((public.create_abort_replacement_job('e1b00000-0000-0000-0000-000000000001')->>'alreadyExists')::boolean, 'replacement is idempotent');
SELECT pg_temp.check((SELECT j.status = 'ready_for_pickup' AND j.driver_id IS NULL AND jp.total_price = 250
                        FROM public.jobs j JOIN public.job_pricing jp ON jp.job_id = j.id
                       WHERE j.rebooked_from_job_id = 'e1b00000-0000-0000-0000-000000000001'),
                     'replacement is unassigned, linked and priced');

-- ── 5b. issued Abort invoice correction: full credit, above-price fee ──
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000002', false); -- super admin
UPDATE public.invoices SET status = 'sent', sent_at = now()
 WHERE id = 'f1b00000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_error(format(
  $q$SELECT public.correct_invoiced_job_abort_fee(%L,'f1b00000-0000-0000-0000-000000000001',275,100,'Client authorised revised Abort fee',false)$q$,
  (SELECT id FROM public.job_aborts WHERE job_id='e1b00000-0000-0000-0000-000000000001')),
  'CLIENT_FEE_CONFIRMATION_REQUIRED');
SELECT pg_temp.expect_error(format(
  $q$SELECT public.correct_invoiced_job_abort_fee(%L,'f1b00000-0000-0000-0000-000000000001',275,100,'Client authorised revised Abort fee',true)$q$,
  (SELECT id FROM public.job_aborts WHERE job_id='e1b00000-0000-0000-0000-000000000001')),
  'CREDIT_NOTE_AUTHORISATION_REQUIRED');
SELECT pg_temp.check(
 (public.correct_invoiced_job_abort_fee_authorised(
   (SELECT id FROM public.job_aborts WHERE job_id='e1b00000-0000-0000-0000-000000000001'),
   'f1b00000-0000-0000-0000-000000000001',275,100,'Client authorised revised Abort fee',true,true,false,false,'sent',100)->>'approvedAmount')::numeric=275,
 'issued original fully credited and new higher fee agreed');
SELECT pg_temp.check((SELECT status='cancelled' FROM public.invoices WHERE id='f1b00000-0000-0000-0000-000000000001'),
 'original invoice cancelled');
SELECT pg_temp.check((SELECT credit_note_id IS NOT NULL AND original_invoice_number='ABT-INV-1'
  AND previous_fee=100 AND revised_fee=275 FROM public.job_abort_invoice_corrections
  WHERE job_id='e1b00000-0000-0000-0000-000000000001'),
 'credit note and old/new values linked to Abort');
SELECT pg_temp.check((SELECT total_price=250 FROM public.job_pricing WHERE job_id='e1b00000-0000-0000-0000-000000000001'),
 'original transport price remains unchanged');
INSERT INTO public.invoices (id, org_id, invoice_number, status, subtotal, total)
 VALUES ('f1b00000-0000-0000-0000-000000000004','a1b00000-0000-0000-0000-000000000001','ABT-INV-4','draft',275,275);
INSERT INTO public.invoice_items (invoice_id,job_id,description,quantity,unit_price,amount)
 VALUES ('f1b00000-0000-0000-0000-000000000004','e1b00000-0000-0000-0000-000000000001',
   'Abort at Collection — ABT-1 — AB12 CDE',1,275,275);
SELECT pg_temp.check((SELECT replacement_invoice_id='f1b00000-0000-0000-0000-000000000004'
 FROM public.job_abort_invoice_corrections WHERE job_id='e1b00000-0000-0000-0000-000000000001'),
 'revised invoice automatically linked to fully credited original');
SELECT pg_temp.expect_error(format(
 $q$SELECT public.correct_invoiced_job_abort_fee(%L,'f1b00000-0000-0000-0000-000000000001',280,275,'Trying to correct a cancelled invoice',true)$q$,
 (SELECT id FROM public.job_aborts WHERE job_id='e1b00000-0000-0000-0000-000000000001')),
 'ABORT_INVOICE_NOT_FOUND');
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000001', false); -- admin1

-- ── 6. no-name exception: never auto-approved; reopen closes the claim ──────
SELECT pg_temp.check((public.confirm_job_abort('e1b00000-0000-0000-0000-000000000002', NULL, true, NULL)->>'noNameException')::boolean, 'no-name exception accepted');
SELECT pg_temp.check((SELECT no_name_exception AND contact_name IS NULL AND agreed_price IS NULL AND proposed_amount IS NULL
                             AND finance_status = 'pending_review'
                        FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000002'),
                     'unknown price stays NULL and claim is pending');
SELECT pg_temp.expect_error(format($SELECT public.review_job_abort_claim(%L, 'approved', NULL, NULL, true)$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000002')), 'AMOUNT_REQUIRED');
SELECT public.review_job_abort_claim((SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000002'), 'rejected', NULL, 'Customer disputes');
INSERT INTO public.invoices (id, org_id, invoice_number, status, subtotal, total)
VALUES ('f1b00000-0000-0000-0000-000000000003', 'a1b00000-0000-0000-0000-000000000001', 'ABT-INV-3', 'draft', 0, 0);
SELECT pg_temp.expect_error($$INSERT INTO public.invoice_items (invoice_id, job_id, description, quantity, unit_price, amount) VALUES ('f1b00000-0000-0000-0000-000000000003','e1b00000-0000-0000-0000-000000000002','x',1,10,10)$$, 'ABORT_NOT_APPROVED');

-- optional customer notification, at most once
SELECT pg_temp.check((public.notify_customer_job_aborted((SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000002'))->>'queued')::boolean, 'customer notification queued on request');
SELECT pg_temp.check((public.notify_customer_job_aborted((SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000002'))->>'alreadyQueued')::boolean, 'second press does not queue again');

-- super-admin override cannot side-step the workflow
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000002', false); -- super admin
SELECT pg_temp.expect_error($$SELECT public.super_admin_override_job_status('e1b00000-0000-0000-0000-000000000002', 'assigned', 'testing override')$$, 'ABORT_STATUS_PROTECTED');

SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000001', false); -- admin1
SELECT public.reopen_job('e1b00000-0000-0000-0000-000000000002', 'Customer rebooked same job');
SELECT pg_temp.check((SELECT status FROM public.jobs WHERE id = 'e1b00000-0000-0000-0000-000000000002') = 'ready_for_pickup', 'reopened');
SELECT pg_temp.check((SELECT reopened_at IS NOT NULL AND finance_status = 'rejected' FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000002'), 'history kept, claim closed');
SELECT pg_temp.expect_error(format($$SELECT public.review_job_abort_claim(%L, 'approved', 10, NULL)$$,
  (SELECT id FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000002')), 'ABORT_REOPENED');
SELECT public.confirm_job_abort('e1b00000-0000-0000-0000-000000000002', 'Site manager', false, 'ready_for_pickup');
SELECT pg_temp.check((SELECT count(*) FROM public.job_aborts WHERE job_id = 'e1b00000-0000-0000-0000-000000000002') = 2, 'new run can be aborted again; old Abort kept');

-- ── 7. dismissing a request leaves the job as it was ────────────────────────
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000003', false); -- driver1
SELECT public.request_job_abort('e1b00000-0000-0000-0000-000000000006');
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000001', false); -- admin1
SELECT public.dismiss_job_abort_request((SELECT id FROM public.job_abort_requests WHERE job_id = 'e1b00000-0000-0000-0000-000000000006' AND status = 'pending'), 'Vehicle is ready now');
SELECT pg_temp.check((SELECT status FROM public.jobs WHERE id = 'e1b00000-0000-0000-0000-000000000006') = 'pickup_in_progress', 'dismissal leaves job status');
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000003', false); -- driver1
SELECT pg_temp.check((public.request_job_abort('e1b00000-0000-0000-0000-000000000006')->>'duplicate')::boolean = false, 'driver can ask again after dismissal');

-- ── 8. audit trail is append-only ────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', 'b1b00000-0000-0000-0000-000000000001', false); -- admin1
SELECT pg_temp.expect_error($$DELETE FROM public.job_abort_events$$, 'permission denied');
SELECT pg_temp.expect_error($$UPDATE public.job_aborts SET approved_amount = 250$$, 'permission denied');
SELECT pg_temp.check((SELECT count(*) FROM public.job_abort_events WHERE job_id = 'e1b00000-0000-0000-0000-000000000001') >= 4, 'events recorded');

RESET ROLE;
\echo 'ABORT WORKFLOW: ALL CHECKS PASSED'
ROLLBACK;
