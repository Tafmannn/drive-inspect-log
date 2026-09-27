-- Rollback for 20260927110000_close_review_gate_status_race.sql
-- Restores guard_job_driver_writes() without the review-gate exit check.
CREATE OR REPLACE FUNCTION public.guard_job_driver_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_closed text[] := ARRAY['completed','cancelled','archived','failed'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin_or_super_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.driver_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.driver_profiles dp
     WHERE dp.id = OLD.driver_id AND dp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Drivers can only update jobs assigned to them';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['status','has_pickup_inspection','has_delivery_inspection','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','has_pickup_inspection','has_delivery_inspection','updated_at']) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Drivers can only change a job''s workflow status';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status = ANY(v_closed) OR OLD.status = ANY(v_closed)) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Only an admin can move a job to or from ' || NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;
