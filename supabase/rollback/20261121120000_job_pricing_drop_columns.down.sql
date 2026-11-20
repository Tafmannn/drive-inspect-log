-- Rollback for 20261121120000_job_pricing_drop_columns.sql.
-- Re-adds the seven (empty) columns on jobs with their original types and restores the phase 3 seal
-- (forward-and-NULL triggers), i.e. the state after phase 3. The prices are untouched: they are in job_pricing.
-- To get prices back onto jobs as well, then run supabase/rollback/20261121110000_job_pricing_seal.down.sql.
-- Note: the app code from the same release no longer reads these columns; roll the app back too.
BEGIN;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS total_price numeric,
  ADD COLUMN IF NOT EXISTS rate_per_mile numeric,
  ADD COLUMN IF NOT EXISTS admin_rate numeric(10,2),
  ADD COLUMN IF NOT EXISTS caz_ulez_cost numeric,
  ADD COLUMN IF NOT EXISTS pricing_metadata jsonb,
  ADD COLUMN IF NOT EXISTS pricing_suggestion_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_suggestion_used_by uuid;

-- ── 2. Seal: forward any non-NULL write into job_pricing and store NULL ─────
-- UPDATE: a BEFORE trigger, so the row is stored with NULLs in one step (no second write, no recursion).
-- Only values that are NOT NULL are forwarded; NULL means "not given" here (see the header).
CREATE OR REPLACE FUNCTION public.seal_job_pricing_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.job_pricing
    (job_id, org_id, total_price, rate_per_mile, admin_rate, caz_ulez_cost,
     pricing_metadata, pricing_suggestion_used_at, pricing_suggestion_used_by)
  VALUES
    (NEW.id, NEW.org_id, NEW.total_price, NEW.rate_per_mile, NEW.admin_rate, NEW.caz_ulez_cost,
     NEW.pricing_metadata, NEW.pricing_suggestion_used_at, NEW.pricing_suggestion_used_by)
  ON CONFLICT (job_id) DO UPDATE SET
    total_price = COALESCE(EXCLUDED.total_price, public.job_pricing.total_price),
    rate_per_mile = COALESCE(EXCLUDED.rate_per_mile, public.job_pricing.rate_per_mile),
    admin_rate = COALESCE(EXCLUDED.admin_rate, public.job_pricing.admin_rate),
    caz_ulez_cost = COALESCE(EXCLUDED.caz_ulez_cost, public.job_pricing.caz_ulez_cost),
    pricing_metadata = COALESCE(EXCLUDED.pricing_metadata, public.job_pricing.pricing_metadata),
    pricing_suggestion_used_at = COALESCE(EXCLUDED.pricing_suggestion_used_at, public.job_pricing.pricing_suggestion_used_at),
    pricing_suggestion_used_by = COALESCE(EXCLUDED.pricing_suggestion_used_by, public.job_pricing.pricing_suggestion_used_by);

  NEW.total_price := NULL;
  NEW.rate_per_mile := NULL;
  NEW.admin_rate := NULL;
  NEW.caz_ulez_cost := NULL;
  NEW.pricing_metadata := NULL;
  NEW.pricing_suggestion_used_at := NULL;
  NEW.pricing_suggestion_used_by := NULL;
  RETURN NEW;
END;
$$;

-- INSERT: job_pricing has a foreign key to the new job, so the copy must wait until the job row exists
-- (AFTER), and the NULLing is a second write. Its WHEN clause (a NULL price) stops the trigger re-firing.
CREATE OR REPLACE FUNCTION public.seal_job_pricing_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.job_pricing
    (job_id, org_id, total_price, rate_per_mile, admin_rate, caz_ulez_cost,
     pricing_metadata, pricing_suggestion_used_at, pricing_suggestion_used_by)
  VALUES
    (NEW.id, NEW.org_id, NEW.total_price, NEW.rate_per_mile, NEW.admin_rate, NEW.caz_ulez_cost,
     NEW.pricing_metadata, NEW.pricing_suggestion_used_at, NEW.pricing_suggestion_used_by)
  ON CONFLICT (job_id) DO UPDATE SET
    total_price = COALESCE(EXCLUDED.total_price, public.job_pricing.total_price),
    rate_per_mile = COALESCE(EXCLUDED.rate_per_mile, public.job_pricing.rate_per_mile),
    admin_rate = COALESCE(EXCLUDED.admin_rate, public.job_pricing.admin_rate),
    caz_ulez_cost = COALESCE(EXCLUDED.caz_ulez_cost, public.job_pricing.caz_ulez_cost),
    pricing_metadata = COALESCE(EXCLUDED.pricing_metadata, public.job_pricing.pricing_metadata),
    pricing_suggestion_used_at = COALESCE(EXCLUDED.pricing_suggestion_used_at, public.job_pricing.pricing_suggestion_used_at),
    pricing_suggestion_used_by = COALESCE(EXCLUDED.pricing_suggestion_used_by, public.job_pricing.pricing_suggestion_used_by);

  UPDATE public.jobs SET
    total_price = NULL, rate_per_mile = NULL, admin_rate = NULL, caz_ulez_cost = NULL,
    pricing_metadata = NULL, pricing_suggestion_used_at = NULL, pricing_suggestion_used_by = NULL
   WHERE id = NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.seal_job_pricing_before_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seal_job_pricing_after_insert() FROM PUBLIC, anon, authenticated;

-- The phase 1 mirror is replaced by the seal.
DROP TRIGGER IF EXISTS trg_mirror_job_pricing_ins ON public.jobs;
DROP TRIGGER IF EXISTS trg_mirror_job_pricing_upd ON public.jobs;
DROP FUNCTION IF EXISTS public.mirror_job_pricing_from_jobs();

DROP TRIGGER IF EXISTS trg_seal_job_pricing_ins ON public.jobs;
CREATE TRIGGER trg_seal_job_pricing_ins
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  WHEN (NEW.total_price IS NOT NULL OR NEW.rate_per_mile IS NOT NULL OR NEW.admin_rate IS NOT NULL
        OR NEW.caz_ulez_cost IS NOT NULL OR NEW.pricing_metadata IS NOT NULL
        OR NEW.pricing_suggestion_used_at IS NOT NULL OR NEW.pricing_suggestion_used_by IS NOT NULL)
  EXECUTE FUNCTION public.seal_job_pricing_after_insert();

DROP TRIGGER IF EXISTS trg_seal_job_pricing_upd ON public.jobs;
CREATE TRIGGER trg_seal_job_pricing_upd
  BEFORE UPDATE OF total_price, rate_per_mile, admin_rate, caz_ulez_cost, pricing_metadata,
                   pricing_suggestion_used_at, pricing_suggestion_used_by ON public.jobs
  FOR EACH ROW
  WHEN (NEW.total_price IS NOT NULL OR NEW.rate_per_mile IS NOT NULL OR NEW.admin_rate IS NOT NULL
        OR NEW.caz_ulez_cost IS NOT NULL OR NEW.pricing_metadata IS NOT NULL
        OR NEW.pricing_suggestion_used_at IS NOT NULL OR NEW.pricing_suggestion_used_by IS NOT NULL)
  EXECUTE FUNCTION public.seal_job_pricing_before_update();

COMMIT;
