-- Rollback for 20260713180000_complete_job_admin_only.sql
-- Restores complete_job() to its exact prior body from
-- 20260422120617_cdf34bef-25ea-4ef7-ac13-c21126b3eeeb.sql (removes the
-- admin/super-admin authorization check; everything else identical).

CREATE OR REPLACE FUNCTION public.complete_job(
  p_job_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS public.jobs
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.jobs;
  v_allowed text[] := ARRAY['pod_ready','delivery_complete'];
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- Idempotent: if already completed, return as-is.
  IF v_job.status = 'completed' THEN
    RETURN v_job;
  END IF;

  IF NOT (v_job.status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'INVALID_COMPLETION_TRANSITION'
      USING ERRCODE = '23514',
            HINT = 'Cannot complete a job from status ' || v_job.status;
  END IF;

  UPDATE public.jobs
     SET status = 'completed',
         completed_at = COALESCE(completed_at, now()),
         updated_at = now()
   WHERE id = p_job_id
   RETURNING * INTO v_job;

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (
    p_job_id,
    v_job.org_id,
    'job_completed',
    NULLIF(v_job.status, 'completed'),  -- defensive
    'completed',
    COALESCE(p_notes, 'Job marked complete after POD review')
  );

  RETURN v_job;
END
$$;
