-- STAGING ONLY. Marks the database as the Axentra staging target so every later
-- batch can fail closed on any other database (see build-batches.py guard).
-- Structural guard: only proceeds on the pre-reconciliation staging state
-- (hand-made reconstructed ledger rows present, job_pricing absent). Production
-- has neither property, so this statement cannot mark production.
DO $guard$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = 'reconstructed_baseline_driver_profiles')
     OR to_regclass('public.job_pricing') IS NOT NULL THEN
    RAISE EXCEPTION 'TARGET GUARD: not the pre-reconciliation Axentra staging database';
  END IF;
END $guard$;
DO $mark$ BEGIN
  EXECUTE format('COMMENT ON DATABASE %I IS %L', current_database(), 'axentra-staging:mfedxybzajdgavzmajkl');
END $mark$;
