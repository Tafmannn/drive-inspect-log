-- Super-admin override: put a job into ANY status, with a reason and an audit trail.
--
-- Why: the admin "Change status" control only offers the transitions in
-- ADMIN_ALLOWED_TRANSITIONS (src/lib/statusConfig.ts), which is right for day-to-day
-- use but leaves no way to undo a test or a mistake (e.g. a completed job that was
-- invoiced by accident and needs to go back to Ready to invoice).
--
-- Rules enforced HERE, not just in the UI:
--   * the caller must be an active super admin (is_super_admin() checks the
--     account is active); admins and drivers are refused;
--   * a reason of at least 5 characters is required;
--   * the target must be a real job status;
--   * the job must not be on a live invoice (a non-voided invoice item or a
--     non-cancelled legacy invoice). Cancel the invoice first, otherwise the job
--     and its invoice would contradict each other;
--   * every override is recorded in job_status_overrides and in job_activity_log.
--
-- Side effects handled on purpose:
--   * trg_jobs_completed_at_semantics sets completed_at when a job becomes
--     'completed' and clears it for any other status. The previous completed_at is
--     kept in the audit row so it can be restored by hand.
--   * trg_enqueue_customer_notification would email the client "collected" /
--     "delivered" when a job moves to those statuses. A manual correction must not
--     message a customer, so any notification queued by this transaction is removed.
--
-- Keep the status list in sync with JOB_STATUS in src/lib/statusConfig.ts
-- (src/test/job-status-override.test.ts checks this). Re-runnable.

CREATE TABLE IF NOT EXISTS public.job_status_overrides (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL,
  job_id            uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  actor_id          uuid NOT NULL,
  from_status       text NOT NULL,
  to_status         text NOT NULL,
  reason            text NOT NULL,
  prev_completed_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_status_overrides_job_idx
  ON public.job_status_overrides (job_id, created_at DESC);

ALTER TABLE public.job_status_overrides ENABLE ROW LEVEL SECURITY;

-- Only super admins can read the audit trail. There is deliberately no INSERT /
-- UPDATE / DELETE policy: rows are written only by the function below.
DROP POLICY IF EXISTS "Super admins can read job status overrides" ON public.job_status_overrides;
CREATE POLICY "Super admins can read job status overrides"
  ON public.job_status_overrides FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

REVOKE ALL ON public.job_status_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_status_overrides TO authenticated;

CREATE OR REPLACE FUNCTION public.super_admin_override_job_status(
  p_job_id uuid,
  p_new_status text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason       text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_org_id       uuid;
  v_from_status  text;
  v_prev_done    timestamptz;
  v_removed      integer := 0;
  v_valid        text[] := ARRAY[
    'draft', 'pending', 'incomplete', 'new', 'ready_for_pickup', 'assigned',
    'pickup_in_progress', 'pickup_complete', 'in_transit', 'delivery_in_progress',
    'delivery_complete', 'pod_ready', 'completed', 'cancelled', 'failed', 'archived'
  ];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501',
            HINT = 'Only a super admin can override a job''s status';
  END IF;

  IF v_reason IS NULL OR char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED'
      USING ERRCODE = '23514', HINT = 'Give a reason of at least 5 characters';
  END IF;

  IF p_new_status IS NULL OR NOT (p_new_status = ANY (v_valid)) THEN
    RAISE EXCEPTION 'INVALID_STATUS'
      USING ERRCODE = '23514', HINT = 'Unknown job status: ' || COALESCE(p_new_status, 'null');
  END IF;

  SELECT org_id, status, completed_at
    INTO v_org_id, v_from_status, v_prev_done
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  IF v_from_status = p_new_status THEN
    RAISE EXCEPTION 'JOB_ALREADY_IN_STATUS'
      USING ERRCODE = '23514', HINT = 'The job is already ' || v_from_status;
  END IF;

  -- Same definition of "invoiced" as the duplicate-invoice guard
  -- (findAlreadyInvoicedJobs in src/features/invoicing/api/createInvoice.ts).
  IF EXISTS (
       SELECT 1 FROM public.invoice_items ii
        WHERE ii.job_id = p_job_id AND NOT COALESCE(ii.voided, false)
     )
     OR EXISTS (
       SELECT 1 FROM public.invoices i
        WHERE i.job_id = p_job_id AND i.status <> 'cancelled'
     )
  THEN
    RAISE EXCEPTION 'JOB_ON_LIVE_INVOICE'
      USING ERRCODE = '23514',
            HINT = 'Cancel the invoice this job is on before changing its status';
  END IF;

  UPDATE public.jobs
     SET status = p_new_status,
         updated_at = now()
   WHERE id = p_job_id;

  -- A manual correction must never message a customer. The enqueue trigger runs
  -- inside this transaction, so its rows carry this transaction's now().
  DELETE FROM public.customer_notifications
   WHERE job_id = p_job_id
     AND status = 'pending'
     AND created_at = now();
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO public.job_status_overrides
    (org_id, job_id, actor_id, from_status, to_status, reason, prev_completed_at)
  VALUES
    (v_org_id, p_job_id, auth.uid(), v_from_status, p_new_status, v_reason, v_prev_done);

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (p_job_id, v_org_id, 'super_admin_status_override', v_from_status, p_new_status,
          'Super-admin override: ' || v_reason);

  RETURN jsonb_build_object(
    'fromStatus', v_from_status,
    'toStatus', p_new_status,
    'removedNotifications', v_removed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_override_job_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_override_job_status(uuid, text, text) TO authenticated;
