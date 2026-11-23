-- Rollback for 20261123100000_job_abort_workflow.sql
--
-- PRE-CHECK: an aborted job has no status to go back to once the workflow is removed.
-- Reopen (or move) every aborted job first; this script refuses to run while any exist.
-- The Abort history tables are dropped; export them first if they hold real records:
--   COPY public.job_aborts TO ...; COPY public.job_abort_events TO ...; COPY public.job_abort_requests TO ...;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.jobs WHERE status = 'aborted') THEN
    RAISE EXCEPTION 'Aborted jobs exist: reopen them before rolling back the Abort workflow';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_notifications WHERE event = 'aborted') THEN
    RAISE EXCEPTION 'Aborted customer notifications exist: delete them before rolling back';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_items_abort_guard ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_invoices_abort_guard ON public.invoices;
DROP FUNCTION IF EXISTS public.guard_abort_invoicing();

DROP TRIGGER IF EXISTS trg_jobs_guard_abort_status ON public.jobs;
DROP FUNCTION IF EXISTS public.guard_job_abort_status();

DROP FUNCTION IF EXISTS public.request_job_abort(uuid);
DROP FUNCTION IF EXISTS public.dismiss_job_abort_request(uuid, text);
DROP FUNCTION IF EXISTS public.confirm_job_abort(uuid, text, boolean, text);
DROP FUNCTION IF EXISTS public.review_job_abort_claim(uuid, text, numeric, text);
DROP FUNCTION IF EXISTS public.notify_customer_job_aborted(uuid);
DROP FUNCTION IF EXISTS public.create_abort_replacement_job(uuid);

DROP TABLE IF EXISTS public.job_abort_events;
DROP TABLE IF EXISTS public.job_abort_requests;
DROP TABLE IF EXISTS public.job_aborts;
DROP FUNCTION IF EXISTS public.abort_eligible_statuses();

DROP INDEX IF EXISTS public.jobs_rebooked_from_idx;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS rebooked_from_job_id;

ALTER TABLE public.customer_notifications DROP CONSTRAINT IF EXISTS customer_notifications_event_check;
ALTER TABLE public.customer_notifications
  ADD CONSTRAINT customer_notifications_event_check CHECK (event IN ('collected', 'delivered'));

-- reopen_job as defined by 20260927001914 (security invoker; org isolation via RLS).
CREATE OR REPLACE FUNCTION public.reopen_job(p_job_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_from_status text;
  v_new_run uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501',
            HINT = 'Only an admin or super-admin can reopen a job';
  END IF;

  SELECT org_id, status INTO v_org_id, v_from_status
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  UPDATE public.inspections SET archived_at = now()
   WHERE job_id = p_job_id AND archived_at IS NULL;

  UPDATE public.damage_items SET archived_at = now()
   WHERE archived_at IS NULL
     AND inspection_id IN (SELECT id FROM public.inspections WHERE job_id = p_job_id);

  UPDATE public.photos SET archived_at = now()
   WHERE job_id = p_job_id AND archived_at IS NULL;

  UPDATE public.jobs
     SET status = 'ready_for_pickup',
         has_pickup_inspection = false,
         has_delivery_inspection = false,
         completed_at = NULL,
         current_run_id = v_new_run,
         updated_at = now()
   WHERE id = p_job_id;

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (p_job_id, v_org_id, 'job_reopened', v_from_status, 'ready_for_pickup',
          COALESCE(p_notes, 'Reopened — previous inspection evidence archived'));

  RETURN jsonb_build_object('runId', v_new_run, 'fromStatus', v_from_status);
END
$function$;

-- Evidence helpers as defined by 20261116214609.
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
      AND j.status NOT IN ('completed', 'cancelled', 'archived')
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
         AND j.status NOT IN ('completed', 'cancelled', 'archived')
     )
$$;
