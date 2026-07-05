-- =====================================================================
-- Verification for 20260630100100_phase1_jobs_write_scope_admin_only
-- =====================================================================
-- Run against the live DB. Read-only except the wrapped negative-test INSERT/
-- DELETE which are rolled back. Replace placeholders with real values.

-- (A) Policy set: expect the 4 command-scoped policies, and NO "Org members
--     can manage jobs" FOR ALL policy.
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'jobs'
ORDER BY policyname;

-- Fixtures: a driver + an admin in the same org, and one of that org's jobs.
SELECT auth_user_id, role, org_id FROM public.user_profiles
WHERE role IN ('driver','admin') ORDER BY role LIMIT 5;
SELECT id, org_id, status FROM public.jobs LIMIT 3;

-- (B) DRIVER can still UPDATE status (inspection flow) — expect success.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<DRIVER_UID>","role":"authenticated"}';
  SAVEPOINT s;
    UPDATE public.jobs SET status = status WHERE id = '<ORG_JOB_ID>';  -- no-op update; should NOT error
  ROLLBACK TO SAVEPOINT s;
ROLLBACK;

-- (C) DRIVER canNOT INSERT a job — expect RLS violation.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<DRIVER_UID>","role":"authenticated"}';
  SAVEPOINT s;
    INSERT INTO public.jobs (org_id, vehicle_reg, status)
    VALUES ((SELECT org_id FROM public.user_profiles WHERE auth_user_id = '<DRIVER_UID>'), 'RLS TEST', 'created');
  ROLLBACK TO SAVEPOINT s;   -- reached only if the INSERT unexpectedly succeeded
ROLLBACK;

-- (D) DRIVER canNOT DELETE a job — expect 0 rows affected / RLS blocks.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<DRIVER_UID>","role":"authenticated"}';
  SAVEPOINT s;
    DELETE FROM public.jobs WHERE id = '<ORG_JOB_ID>';
  ROLLBACK TO SAVEPOINT s;
ROLLBACK;

-- (E) ADMIN in the same org CAN INSERT — expect success.
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<ADMIN_UID>","role":"authenticated"}';
  SAVEPOINT s;
    INSERT INTO public.jobs (org_id, vehicle_reg, status)
    VALUES ((SELECT org_id FROM public.user_profiles WHERE auth_user_id = '<ADMIN_UID>'), 'ADMIN TEST', 'created');
  ROLLBACK TO SAVEPOINT s;
ROLLBACK;
