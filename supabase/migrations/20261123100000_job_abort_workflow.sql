-- Abort workflow: a collection that cannot go ahead (vehicle unavailable, customer cancels,
-- site will not release it, ...) is officially Aborted by an admin, and the agreed fee may be
-- claimed. Drivers can only ASK for an Abort.
--
-- What this adds
--   * jobs.status 'aborted' — operationally terminal. It is NOT completed, NOT cancelled and
--     NOT a delivery. It can only be entered through confirm_job_abort() and only be left
--     through reopen_job(); a trigger refuses every other path (direct PATCH, generic admin
--     status control, super-admin override, submit_inspection, complete_job, service role).
--   * job_abort_requests — a driver's one-tap request. Metadata on an otherwise active job:
--     the job keeps its status and driver until an admin confirms. One pending request per job.
--   * job_aborts — the confirmed Abort for one run of a job: who confirmed, the name of the
--     person confirming on site / at the office (or an explicit admin no-name exception),
--     the server timestamp, a snapshot of the agreed price, and the fee claim
--     (proposed / approved amount, pending_review -> approved | rejected).
--   * job_abort_events — append-only history of every Abort decision.
--   * jobs.rebooked_from_job_id — a replacement job linked to the aborted original.
--   * RPCs: request_job_abort, dismiss_job_abort_request, confirm_job_abort,
--     review_job_abort_claim, notify_customer_job_aborted, create_abort_replacement_job.
--     reopen_job() now refuses to reopen an Abort that is on a live invoice and closes the
--     Abort's claim (it can never become invoice-ready once the job runs again).
--   * Invoicing: an aborted job can only be put on an invoice (either invoicing path) when its
--     claim is approved for more than zero, and the line can never exceed the approved amount
--     plus that job's own recorded expenses. Non-aborted jobs are unaffected.
--   * customer_notifications.event gains 'aborted'. Nothing queues it automatically: the
--     status-change trigger only knows 'collected' / 'delivered'. An admin queues it on purpose.
--
-- Pricing: the agreed price is READ from job_pricing and copied into the Abort; job_pricing is
-- never written. An unknown price stays NULL (never zero), so the admin must enter an amount.
--
-- Re-runnable. Rollback: supabase/rollback/20261123100000_job_abort_workflow.down.sql
-- Keep ABORT_ELIGIBLE_STATUSES in src/features/abort/lib/abortRules.ts in sync with
-- abort_eligible_statuses() below.

-- ── 0. helpers ───────────────────────────────────────────────────────────────
-- Pre-collection statuses an Abort can be raised from. Once the pickup inspection is in,
-- the vehicle has been collected and the delivery / exception workflows apply instead.
CREATE OR REPLACE FUNCTION public.abort_eligible_statuses()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY['new', 'pending', 'ready_for_pickup', 'assigned', 'pickup_in_progress']::text[]
$$;

-- ── 1. tables ────────────────────────────────────────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS rebooked_from_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS jobs_rebooked_from_idx
  ON public.jobs (rebooked_from_job_id) WHERE rebooked_from_job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.job_aborts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organisations(id),
  job_id              uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  run_id              uuid,
  from_status         text NOT NULL,
  driver_id           uuid,
  contact_name        text,
  no_name_exception   boolean NOT NULL DEFAULT false,
  confirmed_by        uuid NOT NULL,
  confirmed_at        timestamptz NOT NULL DEFAULT now(),
  agreed_price        numeric(12,2),
  proposed_amount     numeric(12,2),
  approved_amount     numeric(12,2),
  finance_status      text NOT NULL DEFAULT 'pending_review'
                      CHECK (finance_status IN ('pending_review', 'approved', 'rejected')),
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  review_note         text,
  customer_notified_at timestamptz,
  customer_notified_by uuid,
  reopened_at         timestamptz,
  reopened_by         uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_aborts_name_or_exception CHECK (
    (no_name_exception AND contact_name IS NULL)
    OR (NOT no_name_exception AND contact_name IS NOT NULL AND btrim(contact_name) <> '')
  ),
  CONSTRAINT job_aborts_amounts_non_negative CHECK (
    COALESCE(agreed_price, 0) >= 0 AND COALESCE(proposed_amount, 0) >= 0 AND COALESCE(approved_amount, 0) >= 0
  ),
  CONSTRAINT job_aborts_approved_has_amount CHECK (
    finance_status <> 'approved' OR approved_amount IS NOT NULL
  ),
  CONSTRAINT job_aborts_approved_within_agreed CHECK (
    approved_amount IS NULL OR agreed_price IS NULL OR approved_amount <= agreed_price
  )
);

-- One Abort per run of a job. Reopening starts a new run, so a job can be aborted again later.
CREATE UNIQUE INDEX IF NOT EXISTS job_aborts_job_run_key
  ON public.job_aborts (job_id, COALESCE(run_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS job_aborts_org_finance_idx ON public.job_aborts (org_id, finance_status, confirmed_at DESC);

CREATE TABLE IF NOT EXISTS public.job_abort_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organisations(id),
  job_id          uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  run_id          uuid,
  driver_id       uuid NOT NULL,
  requested_by    uuid NOT NULL,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'dismissed', 'superseded')),
  resolved_at     timestamptz,
  resolved_by     uuid,
  resolution_note text,
  abort_id        uuid REFERENCES public.job_aborts(id),
  CONSTRAINT job_abort_requests_resolved CHECK ((status = 'pending') = (resolved_at IS NULL))
);

-- A repeated tap (or a retried request on a bad connection) can never make a second one.
CREATE UNIQUE INDEX IF NOT EXISTS job_abort_requests_one_pending
  ON public.job_abort_requests (job_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS job_abort_requests_org_status_idx
  ON public.job_abort_requests (org_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.job_abort_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  abort_id    uuid REFERENCES public.job_aborts(id) ON DELETE CASCADE,
  request_id  uuid REFERENCES public.job_abort_requests(id) ON DELETE CASCADE,
  actor_id    uuid,
  action      text NOT NULL CHECK (action IN (
                'requested', 'request_dismissed', 'confirmed', 'claim_approved',
                'claim_rejected', 'reopened', 'customer_notified', 'replacement_created')),
  finance_status text,
  amount      numeric(12,2),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_abort_events_job_idx ON public.job_abort_events (job_id, created_at);

-- ── 2. RLS: read-only from the client; every write goes through the functions below ──
ALTER TABLE public.job_aborts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_abort_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_abort_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.job_aborts, public.job_abort_requests, public.job_abort_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_aborts, public.job_abort_requests, public.job_abort_events TO authenticated;

-- Abort records carry the fee claim, so only admins of the org (and the super admin) see them.
-- Drivers see the outcome through jobs.status.
DROP POLICY IF EXISTS "job_aborts_select_admin" ON public.job_aborts;
CREATE POLICY "job_aborts_select_admin" ON public.job_aborts FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id()));

DROP POLICY IF EXISTS "job_abort_events_select_admin" ON public.job_abort_events;
CREATE POLICY "job_abort_events_select_admin" ON public.job_abort_events FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id()));

-- A driver sees their own requests (to show "Abort requested"); admins see the org's.
DROP POLICY IF EXISTS "job_abort_requests_select" ON public.job_abort_requests;
CREATE POLICY "job_abort_requests_select" ON public.job_abort_requests FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
    OR (requested_by = auth.uid() AND org_id = public.user_org_id())
  );

-- ── 3. the 'aborted' status can only be entered / left through the workflow ──
CREATE OR REPLACE FUNCTION public.guard_job_abort_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'aborted' THEN
      RAISE EXCEPTION 'ABORT_STATUS_PROTECTED'
        USING ERRCODE = '42501', HINT = 'A job cannot be created as aborted';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status = 'aborted' OR OLD.status = 'aborted')
     AND COALESCE(current_setting('axentra.abort_workflow', true), '') <> 'on' THEN
    RAISE EXCEPTION 'ABORT_STATUS_PROTECTED'
      USING ERRCODE = '42501',
            HINT = CASE WHEN NEW.status = 'aborted'
                        THEN 'Use Abort Job: it records who confirmed the Abort and when'
                        ELSE 'An aborted job can only be reopened with Reopen job' END;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_job_abort_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jobs_guard_abort_status ON public.jobs;
CREATE TRIGGER trg_jobs_guard_abort_status
  BEFORE INSERT OR UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_job_abort_status();

-- ── 4. driver: request an Abort ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_job_abort(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_job       record;
  v_driver_id uuid;
  v_existing  public.job_abort_requests%ROWTYPE;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Active driver profile of an active account.
  SELECT dp.id INTO v_driver_id
    FROM public.driver_profiles dp
    JOIN public.user_profiles up ON up.auth_user_id = dp.user_id
   WHERE dp.user_id = v_uid AND up.account_status = 'active'
   LIMIT 1;

  SELECT id, org_id, status, driver_id, current_run_id, has_pickup_inspection, is_hidden
    INTO v_job
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  -- Same answer for "no such job" and "not your job": never confirm another job exists.
  IF v_job.id IS NULL OR v_driver_id IS NULL OR v_job.driver_id IS DISTINCT FROM v_driver_id THEN
    RAISE EXCEPTION 'ABORT_REQUEST_DENIED'
      USING ERRCODE = '42501', HINT = 'Only the driver assigned to this job can request an Abort';
  END IF;

  IF v_job.status = 'aborted' THEN
    RAISE EXCEPTION 'JOB_ALREADY_ABORTED' USING ERRCODE = '23514', HINT = 'This job has already been aborted';
  END IF;

  IF v_job.is_hidden OR NOT (v_job.status = ANY (public.abort_eligible_statuses()))
     OR COALESCE(v_job.has_pickup_inspection, false) THEN
    RAISE EXCEPTION 'ABORT_NOT_ELIGIBLE'
      USING ERRCODE = '23514', HINT = 'An Abort can only be requested before the vehicle is collected';
  END IF;

  SELECT * INTO v_existing FROM public.job_abort_requests
   WHERE job_id = p_job_id AND status = 'pending';
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('requestId', v_existing.id, 'status', 'pending',
                              'requestedAt', v_existing.requested_at, 'duplicate', true);
  END IF;

  INSERT INTO public.job_abort_requests (org_id, job_id, run_id, driver_id, requested_by)
  VALUES (v_job.org_id, p_job_id, v_job.current_run_id, v_driver_id, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.job_abort_events (org_id, job_id, request_id, actor_id, action)
  VALUES (v_job.org_id, p_job_id, v_id, v_uid, 'requested');

  INSERT INTO public.job_activity_log (job_id, org_id, action, notes)
  VALUES (p_job_id, v_job.org_id, 'abort_requested', 'Driver requested an Abort');

  RETURN jsonb_build_object('requestId', v_id, 'status', 'pending', 'requestedAt', now(), 'duplicate', false);
END;
$function$;

-- ── 5. admin: dismiss a request (the job carries on as normal) ───────────────
CREATE OR REPLACE FUNCTION public.dismiss_job_abort_request(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.job_abort_requests%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.job_abort_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL OR NOT (public.is_super_admin() OR v_req.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('requestId', v_req.id, 'status', v_req.status, 'alreadyResolved', true);
  END IF;

  UPDATE public.job_abort_requests
     SET status = 'dismissed', resolved_at = now(), resolved_by = auth.uid(), resolution_note = left(v_note, 500)
   WHERE id = p_request_id;

  INSERT INTO public.job_abort_events (org_id, job_id, request_id, actor_id, action, note)
  VALUES (v_req.org_id, v_req.job_id, v_req.id, auth.uid(), 'request_dismissed', left(v_note, 500));

  INSERT INTO public.job_activity_log (job_id, org_id, action, notes)
  VALUES (v_req.job_id, v_req.org_id, 'abort_request_dismissed',
          COALESCE('Abort request dismissed: ' || left(v_note, 500), 'Abort request dismissed'));

  RETURN jsonb_build_object('requestId', v_req.id, 'status', 'dismissed', 'alreadyResolved', false);
END;
$function$;

-- ── 6. admin: confirm the Abort (atomic) ─────────────────────────────────────
-- p_expected_status: the status the admin was looking at. If the job has moved on since
-- (e.g. the driver has just submitted the pickup), the confirmation is refused rather than
-- applied to a job the admin has not seen.
CREATE OR REPLACE FUNCTION public.confirm_job_abort(
  p_job_id            uuid,
  p_contact_name      text,
  p_no_name_exception boolean DEFAULT false,
  p_expected_status   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text := NULLIF(btrim(regexp_replace(COALESCE(p_contact_name, ''), '\s+', ' ', 'g')), '');
  v_no_name  boolean;
  v_job      record;
  v_price    numeric;
  v_existing public.job_aborts%ROWTYPE;
  v_abort    public.job_aborts%ROWTYPE;
  v_req_ids  uuid[];
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501', HINT = 'Only an admin or super admin can abort a job';
  END IF;

  -- A typed name always wins; the exception is only for when there is no name at all.
  v_no_name := v_name IS NULL AND COALESCE(p_no_name_exception, false);
  IF v_name IS NULL AND NOT v_no_name THEN
    RAISE EXCEPTION 'CONTACT_NAME_REQUIRED'
      USING ERRCODE = '23514', HINT = 'Enter the name of the person confirming the Abort';
  END IF;
  IF v_name IS NOT NULL AND char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'CONTACT_NAME_TOO_LONG' USING ERRCODE = '23514';
  END IF;

  SELECT id, org_id, status, driver_id, current_run_id, has_pickup_inspection, is_hidden
    INTO v_job
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_job.id IS NULL OR NOT (public.is_super_admin() OR v_job.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- Second admin / double tap / retry after a lost response: report the Abort that exists.
  IF v_job.status = 'aborted' THEN
    SELECT * INTO v_existing FROM public.job_aborts
     WHERE job_id = p_job_id AND reopened_at IS NULL
     ORDER BY confirmed_at DESC LIMIT 1;
    RETURN jsonb_build_object(
      'abortId', v_existing.id, 'confirmedAt', v_existing.confirmed_at,
      'contactName', v_existing.contact_name, 'noNameException', v_existing.no_name_exception,
      'financeStatus', v_existing.finance_status, 'alreadyAborted', true);
  END IF;

  IF p_expected_status IS NOT NULL AND p_expected_status <> v_job.status THEN
    RAISE EXCEPTION 'STALE_JOB_STATE'
      USING ERRCODE = '40001', HINT = 'The job is now ' || v_job.status || '. Refresh and check before aborting';
  END IF;

  IF v_job.is_hidden OR NOT (v_job.status = ANY (public.abort_eligible_statuses()))
     OR COALESCE(v_job.has_pickup_inspection, false) THEN
    RAISE EXCEPTION 'ABORT_NOT_ELIGIBLE'
      USING ERRCODE = '23514',
            HINT = 'Only a job that has not been collected can be aborted (status ' || v_job.status || ')';
  END IF;

  -- Agreed price snapshot. Unknown stays NULL: never treat an unknown price as zero.
  SELECT jp.total_price INTO v_price FROM public.job_pricing jp WHERE jp.job_id = p_job_id;
  IF v_price IS NOT NULL AND v_price < 0 THEN v_price := NULL; END IF;

  INSERT INTO public.job_aborts (
    org_id, job_id, run_id, from_status, driver_id, contact_name, no_name_exception,
    confirmed_by, confirmed_at, agreed_price, proposed_amount)
  VALUES (
    v_job.org_id, p_job_id, v_job.current_run_id, v_job.status, v_job.driver_id, v_name, v_no_name,
    v_uid, now(), round(v_price, 2), round(v_price, 2))
  RETURNING * INTO v_abort;

  PERFORM set_config('axentra.abort_workflow', 'on', true);
  UPDATE public.jobs SET status = 'aborted', updated_at = now() WHERE id = p_job_id;
  PERFORM set_config('axentra.abort_workflow', 'off', true);

  WITH resolved AS (
    UPDATE public.job_abort_requests
       SET status = 'confirmed', resolved_at = now(), resolved_by = v_uid, abort_id = v_abort.id
     WHERE job_id = p_job_id AND status = 'pending'
     RETURNING id)
  SELECT array_agg(id) INTO v_req_ids FROM resolved;

  INSERT INTO public.job_abort_events (org_id, job_id, abort_id, request_id, actor_id, action, finance_status, amount, note)
  VALUES (v_job.org_id, p_job_id, v_abort.id, v_req_ids[1], v_uid, 'confirmed', 'pending_review',
          v_abort.proposed_amount,
          CASE WHEN v_no_name THEN 'No-name exception authorised by admin' ELSE 'Confirmed by ' || v_name END);

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (p_job_id, v_job.org_id, 'job_aborted', v_job.status, 'aborted',
          CASE WHEN v_no_name THEN 'Abort confirmed (no-name exception)'
               ELSE 'Abort confirmed by ' || v_name END);

  RETURN jsonb_build_object(
    'abortId', v_abort.id, 'confirmedAt', v_abort.confirmed_at,
    'contactName', v_abort.contact_name, 'noNameException', v_abort.no_name_exception,
    'financeStatus', v_abort.finance_status, 'proposedAmount', v_abort.proposed_amount,
    'resolvedRequests', COALESCE(array_length(v_req_ids, 1), 0), 'alreadyAborted', false);
END;
$function$;

-- ── 7. admin: approve / reject the fee claim ────────────────────────────────
CREATE OR REPLACE FUNCTION public.review_job_abort_claim(
  p_abort_id uuid,
  p_decision text,
  p_amount   numeric DEFAULT NULL,
  p_note     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_abort  public.job_aborts%ROWTYPE;
  v_amount numeric;
  v_note   text := left(NULLIF(btrim(COALESCE(p_note, '')), ''), 500);
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_abort FROM public.job_aborts WHERE id = p_abort_id FOR UPDATE;
  IF v_abort.id IS NULL OR NOT (public.is_super_admin() OR v_abort.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'ABORT_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_abort.reopened_at IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT_REOPENED'
      USING ERRCODE = '23514', HINT = 'The job was reopened, so this Abort can no longer be claimed';
  END IF;

  -- Serialise with the invoicing guard, then refuse to change a claim that is billed.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || v_abort.job_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.invoice_items ii
              WHERE ii.job_id = v_abort.job_id AND NOT COALESCE(ii.voided, false))
     OR EXISTS (SELECT 1 FROM public.invoices i
                 WHERE i.job_id = v_abort.job_id AND i.status <> 'cancelled'
                   AND COALESCE(i.document_type, 'invoice') = 'invoice') THEN
    RAISE EXCEPTION 'ABORT_CLAIM_INVOICED'
      USING ERRCODE = '23514', HINT = 'Cancel the invoice before changing this Abort fee';
  END IF;

  IF p_decision = 'approved' THEN
    v_amount := COALESCE(p_amount, v_abort.proposed_amount);
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'AMOUNT_REQUIRED'
        USING ERRCODE = '23514', HINT = 'The agreed price is unknown, so enter the approved amount';
    END IF;
    v_amount := round(v_amount, 2);
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
    END IF;
    IF v_abort.agreed_price IS NOT NULL AND v_amount > v_abort.agreed_price THEN
      RAISE EXCEPTION 'AMOUNT_ABOVE_AGREED_PRICE'
        USING ERRCODE = '23514', HINT = 'The approved amount cannot exceed the agreed price';
    END IF;
  ELSE
    v_amount := NULL;
  END IF;

  UPDATE public.job_aborts
     SET finance_status = p_decision, approved_amount = v_amount,
         reviewed_by = v_uid, reviewed_at = now(), review_note = v_note
   WHERE id = p_abort_id
   RETURNING * INTO v_abort;

  INSERT INTO public.job_abort_events (org_id, job_id, abort_id, actor_id, action, finance_status, amount, note)
  VALUES (v_abort.org_id, v_abort.job_id, v_abort.id, v_uid,
          CASE WHEN p_decision = 'approved' THEN 'claim_approved' ELSE 'claim_rejected' END,
          p_decision, v_amount, v_note);

  RETURN jsonb_build_object('abortId', v_abort.id, 'financeStatus', v_abort.finance_status,
                            'approvedAmount', v_abort.approved_amount, 'reviewedAt', v_abort.reviewed_at);
END;
$function$;

-- ── 8. admin: tell the customer (optional, on purpose) ──────────────────────
ALTER TABLE public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_event_check;
ALTER TABLE public.customer_notifications
  ADD CONSTRAINT customer_notifications_event_check CHECK (event IN ('collected', 'delivered', 'aborted'));

CREATE OR REPLACE FUNCTION public.notify_customer_job_aborted(p_abort_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_abort  public.job_aborts%ROWTYPE;
  v_job    record;
  v_queued uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_abort FROM public.job_aborts WHERE id = p_abort_id FOR UPDATE;
  IF v_abort.id IS NULL OR NOT (public.is_super_admin() OR v_abort.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'ABORT_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  SELECT id, status, client_id INTO v_job FROM public.jobs WHERE id = v_abort.job_id;
  IF v_abort.reopened_at IS NOT NULL OR v_job.status <> 'aborted' THEN
    RAISE EXCEPTION 'ABORT_NOT_CURRENT' USING ERRCODE = '23514', HINT = 'This job is no longer aborted';
  END IF;
  IF v_job.client_id IS NULL THEN
    RAISE EXCEPTION 'NO_LINKED_CLIENT'
      USING ERRCODE = '23514', HINT = 'Link the job to a client before notifying them';
  END IF;

  -- At most once per job (customer_notifications_job_event_key): a second press is a no-op.
  INSERT INTO public.customer_notifications (org_id, job_id, client_id, event)
  VALUES (v_abort.org_id, v_abort.job_id, v_job.client_id, 'aborted')
  ON CONFLICT (job_id, event) DO NOTHING
  RETURNING id INTO v_queued;

  IF v_queued IS NOT NULL THEN
    UPDATE public.job_aborts SET customer_notified_at = now(), customer_notified_by = v_uid
     WHERE id = p_abort_id;
    INSERT INTO public.job_abort_events (org_id, job_id, abort_id, actor_id, action)
    VALUES (v_abort.org_id, v_abort.job_id, v_abort.id, v_uid, 'customer_notified');
  END IF;

  RETURN jsonb_build_object('queued', v_queued IS NOT NULL, 'alreadyQueued', v_queued IS NULL);
END;
$function$;

-- ── 9. reopen_job: Abort-aware ───────────────────────────────────────────────
-- Now SECURITY DEFINER with an explicit organisation check (it previously relied on the
-- caller's RLS), so it can close the Abort record, which clients cannot write.
CREATE OR REPLACE FUNCTION public.reopen_job(p_job_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_from_status text;
  v_new_run uuid := gen_random_uuid();
  v_abort_id uuid;
BEGIN
  -- Reopening archives every inspection, damage item and photo on the job, so
  -- it is an admin action.
  IF auth.uid() IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501',
            HINT = 'Only an admin or super-admin can reopen a job';
  END IF;

  SELECT org_id, status INTO v_org_id, v_from_status
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL OR NOT (public.is_super_admin() OR v_org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  IF v_from_status = 'aborted' THEN
    -- A billed Abort stays as it is: reopening would leave an invoice for a job that is
    -- running again. Book a linked replacement job instead.
    PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || p_job_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.invoice_items ii
                WHERE ii.job_id = p_job_id AND NOT COALESCE(ii.voided, false))
       OR EXISTS (SELECT 1 FROM public.invoices i
                   WHERE i.job_id = p_job_id AND i.status <> 'cancelled'
                     AND COALESCE(i.document_type, 'invoice') = 'invoice') THEN
      RAISE EXCEPTION 'ABORT_INVOICED'
        USING ERRCODE = '23514',
              HINT = 'This Abort has been invoiced. Create a linked replacement job instead of reopening';
    END IF;

    UPDATE public.job_aborts SET reopened_at = now(), reopened_by = auth.uid()
     WHERE job_id = p_job_id AND reopened_at IS NULL
     RETURNING id INTO v_abort_id;

    IF v_abort_id IS NOT NULL THEN
      INSERT INTO public.job_abort_events (org_id, job_id, abort_id, actor_id, action, note)
      VALUES (v_org_id, p_job_id, v_abort_id, auth.uid(), 'reopened', left(p_notes, 500));
    END IF;
  END IF;

  -- Any request left over from the previous run no longer applies.
  UPDATE public.job_abort_requests
     SET status = 'superseded', resolved_at = now(), resolved_by = auth.uid()
   WHERE job_id = p_job_id AND status = 'pending';

  -- Soft-archive all currently-active evidence
  UPDATE public.inspections SET archived_at = now()
   WHERE job_id = p_job_id AND archived_at IS NULL;

  UPDATE public.damage_items SET archived_at = now()
   WHERE archived_at IS NULL
     AND inspection_id IN (SELECT id FROM public.inspections WHERE job_id = p_job_id);

  UPDATE public.photos SET archived_at = now()
   WHERE job_id = p_job_id AND archived_at IS NULL;

  PERFORM set_config('axentra.abort_workflow', 'on', true);
  UPDATE public.jobs
     SET status = 'ready_for_pickup',
         has_pickup_inspection = false,
         has_delivery_inspection = false,
         completed_at = NULL,
         current_run_id = v_new_run,
         updated_at = now()
   WHERE id = p_job_id;
  PERFORM set_config('axentra.abort_workflow', 'off', true);

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (p_job_id, v_org_id, 'job_reopened', v_from_status, 'ready_for_pickup',
          COALESCE(p_notes, 'Reopened — previous inspection evidence archived'));

  RETURN jsonb_build_object('runId', v_new_run, 'fromStatus', v_from_status);
END
$function$;

-- ── 10. admin: book a replacement job linked to the aborted one ─────────────
-- Copies the movement (vehicle, client, both legs) into a new unassigned job. The agreed
-- price is copied as the starting price of the new movement; the Abort and its claim stay on
-- the original job, so nothing is billed twice.
CREATE OR REPLACE FUNCTION public.create_abort_replacement_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_src    public.jobs%ROWTYPE;
  v_new_id uuid := gen_random_uuid();
  v_ref    text;
  v_n      integer := 1;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF v_src.id IS NULL OR NOT (public.is_super_admin() OR v_src.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_src.status <> 'aborted' THEN
    RAISE EXCEPTION 'JOB_NOT_ABORTED' USING ERRCODE = '23514';
  END IF;

  -- Repeated press: hand back the replacement that already exists.
  SELECT id, external_job_number INTO v_new_id, v_ref FROM public.jobs
   WHERE rebooked_from_job_id = p_job_id AND NOT is_hidden
   ORDER BY created_at DESC LIMIT 1;
  IF v_new_id IS NOT NULL THEN
    RETURN jsonb_build_object('jobId', v_new_id, 'jobRef', v_ref, 'alreadyExists', true);
  END IF;
  v_new_id := gen_random_uuid();

  IF v_src.external_job_number IS NOT NULL THEN
    LOOP
      v_ref := v_src.external_job_number || '-R' || v_n;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.jobs WHERE external_job_number = v_ref);
      v_n := v_n + 1;
    END LOOP;
  END IF;

  INSERT INTO public.jobs (
    id, org_id, external_job_number, status, rebooked_from_job_id, is_test,
    vehicle_reg, vehicle_make, vehicle_model, vehicle_colour, vehicle_year, vehicle_type, vehicle_fuel_type,
    client_id, client_name, client_company, client_email, client_phone, client_notes,
    pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_company,
    pickup_address_line1, pickup_address_line2, pickup_city, pickup_postcode, pickup_notes, pickup_access_notes,
    pickup_time_from, pickup_time_to,
    delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_company,
    delivery_address_line1, delivery_address_line2, delivery_city, delivery_postcode, delivery_notes, delivery_access_notes,
    delivery_time_from, delivery_time_to,
    route_distance_miles, route_eta_minutes, distance_miles, caz_ulez_flag, priority, job_type, job_source, job_notes,
    current_run_id)
  VALUES (
    v_new_id, v_src.org_id, v_ref, 'ready_for_pickup', p_job_id, v_src.is_test,
    v_src.vehicle_reg, v_src.vehicle_make, v_src.vehicle_model, v_src.vehicle_colour, v_src.vehicle_year, v_src.vehicle_type, v_src.vehicle_fuel_type,
    v_src.client_id, v_src.client_name, v_src.client_company, v_src.client_email, v_src.client_phone, v_src.client_notes,
    v_src.pickup_contact_name, v_src.pickup_contact_phone, v_src.pickup_contact_email, v_src.pickup_company,
    v_src.pickup_address_line1, v_src.pickup_address_line2, v_src.pickup_city, v_src.pickup_postcode, v_src.pickup_notes, v_src.pickup_access_notes,
    v_src.pickup_time_from, v_src.pickup_time_to,
    v_src.delivery_contact_name, v_src.delivery_contact_phone, v_src.delivery_contact_email, v_src.delivery_company,
    v_src.delivery_address_line1, v_src.delivery_address_line2, v_src.delivery_city, v_src.delivery_postcode, v_src.delivery_notes, v_src.delivery_access_notes,
    v_src.delivery_time_from, v_src.delivery_time_to,
    v_src.route_distance_miles, v_src.route_eta_minutes, v_src.distance_miles, v_src.caz_ulez_flag, v_src.priority, v_src.job_type, v_src.job_source,
    concat_ws(E'\n', 'Rebooked after Abort of ' || COALESCE(v_src.external_job_number, left(v_src.id::text, 8)), v_src.job_notes),
    gen_random_uuid());

  INSERT INTO public.job_pricing (job_id, org_id, total_price, rate_per_mile, admin_rate, caz_ulez_cost)
  SELECT v_new_id, jp.org_id, jp.total_price, jp.rate_per_mile, jp.admin_rate, jp.caz_ulez_cost
    FROM public.job_pricing jp WHERE jp.job_id = p_job_id
  ON CONFLICT (job_id) DO NOTHING;

  INSERT INTO public.job_abort_events (org_id, job_id, actor_id, action, note)
  VALUES (v_src.org_id, p_job_id, v_uid, 'replacement_created', 'Replacement job ' || v_new_id::text);

  INSERT INTO public.job_activity_log (job_id, org_id, action, notes)
  VALUES (p_job_id, v_src.org_id, 'abort_replacement_created',
          'Replacement job ' || COALESCE(v_ref, left(v_new_id::text, 8)) || ' created'),
         (v_new_id, v_src.org_id, 'job_created_from_abort',
          'Rebooked from aborted job ' || COALESCE(v_src.external_job_number, left(v_src.id::text, 8)));

  RETURN jsonb_build_object('jobId', v_new_id, 'jobRef', v_ref, 'alreadyExists', false);
END;
$function$;

-- ── 11. invoicing: an aborted job is billable only as its approved Abort fee ─
-- Runs alongside guard_one_live_invoice_per_job (which still stops double billing). For any
-- job that is not aborted this function does nothing, so normal POD rules are unchanged.
CREATE OR REPLACE FUNCTION public.guard_abort_invoicing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status  text;
  v_run     uuid;
  v_abort   public.job_aborts%ROWTYPE;
  v_ceiling numeric;
  v_amount  numeric;
BEGIN
  IF NEW.job_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.status = 'cancelled' OR COALESCE(NEW.document_type, 'invoice') <> 'invoice' THEN
      RETURN NEW;
    END IF;
    v_amount := NEW.subtotal;
  ELSE
    IF COALESCE(NEW.voided, false) THEN RETURN NEW; END IF;
    v_amount := NEW.amount;
  END IF;

  SELECT status, current_run_id INTO v_status, v_run FROM public.jobs WHERE id = NEW.job_id;
  IF v_status IS DISTINCT FROM 'aborted' THEN RETURN NEW; END IF;

  SELECT * INTO v_abort FROM public.job_aborts
   WHERE job_id = NEW.job_id AND reopened_at IS NULL
     AND run_id IS NOT DISTINCT FROM v_run
   ORDER BY confirmed_at DESC LIMIT 1;

  IF v_abort.id IS NULL OR v_abort.finance_status <> 'approved'
     OR COALESCE(v_abort.approved_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'ABORT_NOT_APPROVED: job % is aborted and its fee has not been approved', NEW.job_id
      USING ERRCODE = '23514';
  END IF;

  -- Never more than the approved fee plus that job's own recorded expenses (gross).
  SELECT v_abort.approved_amount + COALESCE(sum(e.amount), 0) INTO v_ceiling
    FROM public.expenses e WHERE e.job_id = NEW.job_id AND NOT COALESCE(e.is_hidden, false);
  IF COALESCE(v_amount, 0) > v_ceiling + 0.005 THEN
    RAISE EXCEPTION 'ABORT_AMOUNT_EXCEEDED: line % is above the approved Abort fee %', v_amount, v_abort.approved_amount
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_abort_invoicing() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_invoice_items_abort_guard ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_abort_guard
  BEFORE INSERT OR UPDATE OF job_id, amount, voided ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_abort_invoicing();

DROP TRIGGER IF EXISTS trg_invoices_abort_guard ON public.invoices;
CREATE TRIGGER trg_invoices_abort_guard
  BEFORE INSERT OR UPDATE OF job_id, status, document_type, subtotal ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_abort_invoicing();

-- ── 12. drivers lose evidence access to aborted jobs, as for other closed jobs ──
-- Keep in sync with src/lib/driverJobAccess.ts and supabase/functions/_shared/auth.ts.
CREATE OR REPLACE FUNCTION public.driver_can_read_job_evidence(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.driver_profiles dp ON dp.id = j.driver_id
    WHERE j.id = p_job_id
      AND dp.user_id = auth.uid()
      AND j.status NOT IN ('completed', 'cancelled', 'archived', 'aborted')
  )
$$;

CREATE OR REPLACE FUNCTION public.driver_can_use_job_path(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT split_part(p_name, '/', 1) = 'jobs'
     AND EXISTS (
       SELECT 1
       FROM public.jobs j
       JOIN public.driver_profiles dp ON dp.id = j.driver_id
       WHERE j.id::text = split_part(p_name, '/', 2)
         AND dp.user_id = auth.uid()
         AND j.status NOT IN ('completed', 'cancelled', 'archived', 'aborted')
     )
$$;

-- ── 13. grants ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.request_job_abort(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_job_abort_request(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_job_abort(uuid, text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_job_abort_claim(uuid, text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_customer_job_aborted(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_abort_replacement_job(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_job_abort(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_job_abort_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_job_abort(uuid, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_job_abort_claim(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_customer_job_aborted(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_abort_replacement_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_job(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abort_eligible_statuses() TO authenticated;
