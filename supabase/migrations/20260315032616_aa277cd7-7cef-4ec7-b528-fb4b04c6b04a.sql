
-- P0-A: Fix user_org_id() to read from JWT metadata, not root
CREATE OR REPLACE FUNCTION public.user_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
    nullif(auth.jwt() -> 'user_metadata' ->> 'org_id', '')::uuid,
    CASE
      WHEN public.is_super_admin() THEN (
        SELECT id FROM public.organisations ORDER BY created_at ASC LIMIT 1
      )
      ELSE NULL
    END
  );
$$;

-- P1-E: Create DB sequence for atomic job number generation
CREATE SEQUENCE IF NOT EXISTS public.job_number_seq START WITH 1 INCREMENT BY 1;

-- Seed the sequence to max existing AX number
DO $$
DECLARE
  max_num INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(
      CASE
        WHEN external_job_number ~ '^AX\d+$'
        THEN CAST(SUBSTRING(external_job_number FROM 3) AS INTEGER)
        ELSE 0
      END
    ), 0
  ) INTO max_num FROM public.jobs;

  IF max_num > 0 THEN
    PERFORM setval('public.job_number_seq', max_num);
  END IF;
END $$;

-- Atomic job number function
CREATE OR REPLACE FUNCTION public.next_job_number()
 RETURNS text
 LANGUAGE sql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 'AX' || LPAD(nextval('public.job_number_seq')::text, 4, '0');
$$;

-- P1-F: Add unique constraint on external_job_number safely
-- First deduplicate any existing duplicates by appending suffix
DO $$
DECLARE
  rec RECORD;
  suffix INTEGER;
BEGIN
  FOR rec IN
    SELECT external_job_number, array_agg(id ORDER BY created_at ASC) AS ids
    FROM public.jobs
    WHERE external_job_number IS NOT NULL AND external_job_number != ''
    GROUP BY external_job_number
    HAVING COUNT(*) > 1
  LOOP
    suffix := 1;
    FOR i IN 2..array_length(rec.ids, 1) LOOP
      UPDATE public.jobs
        SET external_job_number = rec.external_job_number || '-DUP' || suffix
        WHERE id = rec.ids[i];
      suffix := suffix + 1;
    END LOOP;
  END LOOP;
END $$;

-- Now add the unique constraint
ALTER TABLE public.jobs ADD CONSTRAINT jobs_external_job_number_unique UNIQUE (external_job_number);
