-- Rollback for 20260927100100_block_privilege_escalation_and_driver_job_tampering.sql
DROP TRIGGER IF EXISTS trg_user_profiles_guard_privileged ON public.user_profiles;
DROP FUNCTION IF EXISTS public.guard_user_profile_privileged_columns();
DROP TRIGGER IF EXISTS trg_jobs_guard_driver_writes ON public.jobs;
DROP FUNCTION IF EXISTS public.guard_job_driver_writes();
DROP POLICY IF EXISTS "app_settings_write_admin" ON public.app_settings;
CREATE POLICY "app_settings_write_admin"
ON public.app_settings FOR ALL TO authenticated
USING (public.is_admin_or_super_admin())
WITH CHECK (public.is_admin_or_super_admin());

CREATE OR REPLACE FUNCTION public.reopen_job(p_job_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_from_status text;
  v_new_run uuid := gen_random_uuid();
BEGIN
  SELECT org_id, status INTO v_org_id, v_from_status
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- Soft-archive all currently-active evidence
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
