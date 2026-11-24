-- Only the disposable Supabase local database may execute this SQL.
-- Expected to fail if the local migration chain cannot reconstruct Axentra.
\set ON_ERROR_STOP 1
DO $guard$
BEGIN
  IF inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
    RAISE EXCEPTION 'Refusing non-loopback database: %', inet_server_addr();
  END IF;
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected local database name';
  END IF;
  IF to_regclass('public.user_profiles') IS NULL
     OR to_regclass('public.driver_profiles') IS NULL
     OR to_regclass('public.jobs') IS NULL
     OR to_regclass('public.job_aborts') IS NULL
     OR to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION 'Missing essential table: migration chain incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c WHERE c.oid = 'public.job_aborts'::regclass AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'job_aborts RLS is disabled'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c WHERE c.oid = 'public.user_profiles'::regclass AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'user_profiles RLS is disabled'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='request_job_abort'
  ) THEN RAISE EXCEPTION 'request_job_abort RPC missing'; END IF;
END
$guard$;
SELECT 'PASS: local migrated schema and essential RLS controls present' AS result;
