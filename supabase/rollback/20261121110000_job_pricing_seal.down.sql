-- Rollback for 20261121110000_job_pricing_seal.sql: un-seal.
-- Drops the seal triggers, copies every value in job_pricing back onto its job (so the old columns hold
-- the data again), and restores the phase 1 mirror. Run this BEFORE rolling back phase 1 (which drops
-- job_pricing). The app keeps working either way: it reads job_pricing and writes to both.
-- NOTE: jobs.updated_at moves on the rows that are copied back.
BEGIN;

DROP TRIGGER IF EXISTS trg_seal_job_pricing_ins ON public.jobs;
DROP TRIGGER IF EXISTS trg_seal_job_pricing_upd ON public.jobs;
DROP FUNCTION IF EXISTS public.seal_job_pricing_before_update();
DROP FUNCTION IF EXISTS public.seal_job_pricing_after_insert();

UPDATE public.jobs j SET
  total_price = p.total_price, rate_per_mile = p.rate_per_mile, admin_rate = p.admin_rate,
  caz_ulez_cost = p.caz_ulez_cost, pricing_metadata = p.pricing_metadata,
  pricing_suggestion_used_at = p.pricing_suggestion_used_at,
  pricing_suggestion_used_by = p.pricing_suggestion_used_by
  FROM public.job_pricing p
 WHERE p.job_id = j.id;

-- ── Mirror: a change to the old columns is copied into job_pricing ─────────
-- SECURITY DEFINER so it works whoever made the change. On UPDATE, a column is only copied when it
-- actually changed, so an unrelated edit never overwrites a value newer than the old column.
CREATE OR REPLACE FUNCTION public.mirror_job_pricing_from_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.job_pricing
      (job_id, org_id, total_price, rate_per_mile, admin_rate, caz_ulez_cost,
       pricing_metadata, pricing_suggestion_used_at, pricing_suggestion_used_by)
    VALUES
      (NEW.id, NEW.org_id, NEW.total_price, NEW.rate_per_mile, NEW.admin_rate, NEW.caz_ulez_cost,
       NEW.pricing_metadata, NEW.pricing_suggestion_used_at, NEW.pricing_suggestion_used_by)
    ON CONFLICT (job_id) DO UPDATE SET
      total_price = EXCLUDED.total_price,
      rate_per_mile = EXCLUDED.rate_per_mile,
      admin_rate = EXCLUDED.admin_rate,
      caz_ulez_cost = EXCLUDED.caz_ulez_cost,
      pricing_metadata = EXCLUDED.pricing_metadata,
      pricing_suggestion_used_at = EXCLUDED.pricing_suggestion_used_at,
      pricing_suggestion_used_by = EXCLUDED.pricing_suggestion_used_by;
  ELSE
    INSERT INTO public.job_pricing
      (job_id, org_id, total_price, rate_per_mile, admin_rate, caz_ulez_cost,
       pricing_metadata, pricing_suggestion_used_at, pricing_suggestion_used_by)
    VALUES
      (NEW.id, NEW.org_id, NEW.total_price, NEW.rate_per_mile, NEW.admin_rate, NEW.caz_ulez_cost,
       NEW.pricing_metadata, NEW.pricing_suggestion_used_at, NEW.pricing_suggestion_used_by)
    ON CONFLICT (job_id) DO UPDATE SET
      total_price = CASE WHEN OLD.total_price IS DISTINCT FROM NEW.total_price THEN NEW.total_price ELSE public.job_pricing.total_price END,
      rate_per_mile = CASE WHEN OLD.rate_per_mile IS DISTINCT FROM NEW.rate_per_mile THEN NEW.rate_per_mile ELSE public.job_pricing.rate_per_mile END,
      admin_rate = CASE WHEN OLD.admin_rate IS DISTINCT FROM NEW.admin_rate THEN NEW.admin_rate ELSE public.job_pricing.admin_rate END,
      caz_ulez_cost = CASE WHEN OLD.caz_ulez_cost IS DISTINCT FROM NEW.caz_ulez_cost THEN NEW.caz_ulez_cost ELSE public.job_pricing.caz_ulez_cost END,
      pricing_metadata = CASE WHEN OLD.pricing_metadata IS DISTINCT FROM NEW.pricing_metadata THEN NEW.pricing_metadata ELSE public.job_pricing.pricing_metadata END,
      pricing_suggestion_used_at = CASE WHEN OLD.pricing_suggestion_used_at IS DISTINCT FROM NEW.pricing_suggestion_used_at THEN NEW.pricing_suggestion_used_at ELSE public.job_pricing.pricing_suggestion_used_at END,
      pricing_suggestion_used_by = CASE WHEN OLD.pricing_suggestion_used_by IS DISTINCT FROM NEW.pricing_suggestion_used_by THEN NEW.pricing_suggestion_used_by ELSE public.job_pricing.pricing_suggestion_used_by END;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_job_pricing_from_jobs() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mirror_job_pricing_ins ON public.jobs;
CREATE TRIGGER trg_mirror_job_pricing_ins
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  WHEN (NEW.total_price IS NOT NULL OR NEW.rate_per_mile IS NOT NULL OR NEW.admin_rate IS NOT NULL
        OR NEW.caz_ulez_cost IS NOT NULL OR NEW.pricing_metadata IS NOT NULL
        OR NEW.pricing_suggestion_used_at IS NOT NULL OR NEW.pricing_suggestion_used_by IS NOT NULL)
  EXECUTE FUNCTION public.mirror_job_pricing_from_jobs();

DROP TRIGGER IF EXISTS trg_mirror_job_pricing_upd ON public.jobs;
CREATE TRIGGER trg_mirror_job_pricing_upd
  AFTER UPDATE OF total_price, rate_per_mile, admin_rate, caz_ulez_cost, pricing_metadata,
                  pricing_suggestion_used_at, pricing_suggestion_used_by ON public.jobs
  FOR EACH ROW
  WHEN (OLD.total_price IS DISTINCT FROM NEW.total_price
     OR OLD.rate_per_mile IS DISTINCT FROM NEW.rate_per_mile
     OR OLD.admin_rate IS DISTINCT FROM NEW.admin_rate
     OR OLD.caz_ulez_cost IS DISTINCT FROM NEW.caz_ulez_cost
     OR OLD.pricing_metadata IS DISTINCT FROM NEW.pricing_metadata
     OR OLD.pricing_suggestion_used_at IS DISTINCT FROM NEW.pricing_suggestion_used_at
     OR OLD.pricing_suggestion_used_by IS DISTINCT FROM NEW.pricing_suggestion_used_by)
  EXECUTE FUNCTION public.mirror_job_pricing_from_jobs();

COMMIT;
