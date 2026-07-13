-- =====================================================================
-- WORKFLOW-006: complete_job must be restricted to admin/super-admin
-- =====================================================================
-- DEFECT: complete_job() — "Single authoritative server-side route to mark
--   a job COMPLETED. Used by POD review surfaces in place of direct status
--   updates" (its own header comment) — has never had any role check since
--   its creation (20260422120617). It validates only that the status
--   transition is legal (pod_ready/delivery_complete -> completed); it does
--   not check who is calling it. The function is SECURITY INVOKER (no
--   SECURITY DEFINER), so it runs under the caller's own RLS permissions,
--   and jobs_update_org (20260630100100) intentionally allows ANY org
--   member to UPDATE jobs (drivers advance status via submit_inspection).
--   That reasoning didn't anticipate this THIRD status-changing path: any
--   authenticated driver could call complete_job directly for any of their
--   org's pod_ready/delivery_complete jobs and mark it completed —
--   completely bypassing the admin review step every POD review surface
--   (AdminPodReview, ControlPodReview) exists to enforce. The entire
--   "Confirm"/approve action is gated client-side only (behind
--   AdminRoute/ControlRoute); nothing stopped a direct RPC call.
--
-- FIX: mirror the same admin-only pattern already used for job INSERT/
--   DELETE (jobs_insert_admin/jobs_delete_admin) and for the assigned-
--   driver check added to submit_inspection: reject unless the caller is
--   admin or super-admin, before touching any row.
--
-- Everything else in this function is byte-for-byte unchanged.
-- =====================================================================

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
  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501',
            HINT = 'Only an admin or super-admin can complete a job after POD review';
  END IF;

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
