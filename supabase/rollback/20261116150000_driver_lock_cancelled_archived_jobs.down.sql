-- Rollback for 20261116150000_driver_lock_cancelled_archived_jobs.sql
-- Restores the previous helper bodies, which locked drivers out of
-- 'completed' jobs only.
BEGIN;

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
      AND j.status <> 'completed'
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
         AND j.status <> 'completed'
     )
$$;

COMMIT;
