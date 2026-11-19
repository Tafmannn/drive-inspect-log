-- =====================================================================
-- Profitability reporting, step 1: let a driver carry a pay rate so a
-- job's margin can eventually include labour cost, not just logged
-- expenses. Additive only — two new nullable columns, no existing
-- column touched, no RLS policy touched (driver_profiles' existing
-- policies already govern SELECT/UPDATE scoping for these columns).
--
-- pay_basis is intentionally a free-text CHECK, not an enum: matches
-- the rest of this schema's convention (jobs.status, inspections.type
-- are both text + CHECK, not Postgres enum types), so it isn't type
-- gymnastics to add a payout basis later (e.g. "hourly", once hours
-- worked per job is tracked somewhere — it is not today, so the UI
-- only offers per_job / per_mile for now).
-- =====================================================================

ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS pay_rate numeric,
  ADD COLUMN IF NOT EXISTS pay_basis text;

ALTER TABLE public.driver_profiles
  DROP CONSTRAINT IF EXISTS driver_profiles_pay_basis_check;

ALTER TABLE public.driver_profiles
  ADD CONSTRAINT driver_profiles_pay_basis_check
  CHECK (pay_basis IS NULL OR pay_basis IN ('per_job', 'per_mile', 'hourly'));

COMMENT ON COLUMN public.driver_profiles.pay_rate IS
  'Driver payout rate, interpreted per pay_basis. NULL = not yet set; profitability views treat labour cost as unknown, never zero.';
COMMENT ON COLUMN public.driver_profiles.pay_basis IS
  'per_job | per_mile | hourly. hourly is accepted but not yet computable per-job (no hours-worked source) — UI surfaces it as missing input rather than guessing.';
