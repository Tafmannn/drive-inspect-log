-- Treat cancelled and archived jobs like completed ones for drivers.
--
-- 20261116120000 and 20261116140000 locked a driver out of a job's evidence
-- (inspections, photos, damage, evidence items, and the photo/signature files
-- in storage) once the job was 'completed'. Cancelled and archived jobs are
-- just as closed, so drivers lose access to those too. Admins are unaffected.
--
-- Keep the status list in sync with src/lib/driverJobAccess.ts and
-- callerCanAccessPath() in supabase/functions/_shared/auth.ts.
--
-- Only the two helper bodies change; every policy that calls them picks the
-- new rule up automatically. CREATE OR REPLACE keeps this re-runnable.

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
