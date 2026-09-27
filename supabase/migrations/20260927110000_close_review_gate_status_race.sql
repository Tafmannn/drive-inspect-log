-- 20260927110000_close_review_gate_status_race
--
-- Found by a controlled concurrency load test (30 simulated drivers, an
-- offline-queue reconnection burst, duplicate-submission storms, and admin
-- review racing a driver's writes on the same job — run against a local
-- replica of production).
--
-- guard_job_driver_writes() (added in 20260927100100) blocks a driver from
-- moving a job into/out of a CLOSED status (completed/cancelled/archived/
-- failed), but not out of pod_ready or delivery_complete — the two
-- "awaiting admin review" states. In the load test, a driver's own client
-- sending a stray status update (e.g. a stale InspectionFlow "K" re-check
-- poking status back to delivery_in_progress) raced an admin's complete_job
-- on the same job: in roughly half of 15 concurrent trials the driver's
-- write landed first and silently knocked the job out of pod_ready, which
-- then made the admin's legitimate complete_job fail with
-- INVALID_COMPLETION_TRANSITION.
--
-- No legitimate driver-initiated write ever needs to leave pod_ready or
-- delivery_complete: submit_inspection() itself already refuses to run for a
-- non-admin once the job is in either state (see v_blocking_statuses /
-- INSPECTION_ALREADY_SUBMITTED), so the only path that could reach this was
-- a raw status UPDATE bypassing the RPC. Folding these two into the same
-- "driver may not leave" set the closed statuses already get closes that
-- path without touching any working transition (submit_inspection's own
-- delivery_in_progress -> pod_ready / delivery_complete writes are entering
-- the gate, not leaving it, so they're unaffected).
CREATE OR REPLACE FUNCTION public.guard_job_driver_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_closed text[] := ARRAY['completed','cancelled','archived','failed'];
  v_review_gate text[] := ARRAY['pod_ready','delivery_complete'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin_or_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Must be the job's assigned driver.
  IF OLD.driver_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.driver_profiles dp
     WHERE dp.id = OLD.driver_id AND dp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Drivers can only update jobs assigned to them';
  END IF;

  -- Only workflow columns may change; everything else is admin-owned.
  IF (to_jsonb(NEW) - ARRAY['status','has_pickup_inspection','has_delivery_inspection','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','has_pickup_inspection','has_delivery_inspection','updated_at']) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Drivers can only change a job''s workflow status';
  END IF;

  -- Closing (or reopening a closed) job is an admin decision.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status = ANY(v_closed) OR OLD.status = ANY(v_closed)) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Only an admin can move a job to or from ' || NEW.status;
  END IF;

  -- Once a job is awaiting admin review (pod_ready / delivery_complete), a
  -- driver may not move it back out from under that review.
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status = ANY(v_review_gate) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Job is awaiting admin review — only an admin can move it out of ' || OLD.status;
  END IF;

  RETURN NEW;
END;
$function$;
