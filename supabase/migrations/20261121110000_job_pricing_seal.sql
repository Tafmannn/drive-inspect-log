-- Phase 3 of moving job prices out of `jobs` (see docs/security/job-pricing-split.md): THE SEAL.
--
-- After phase 1 every price is also in public.job_pricing (admin-only) and after phase 2 the app reads
-- prices only from there and writes to both. This migration empties the seven price columns on `jobs`
-- (a driver can read their own jobs, so while those columns held data a driver could read it) and makes
-- sure they stay empty.
--
-- The columns are KEPT, set to NULL, rather than dropped:
--   * a forgotten reader gets NULL instead of an error;
--   * an old browser tab that still writes a price is not refused: the write is forwarded into
--     job_pricing and NULL is stored, so nothing is lost and nothing readable is left behind;
--   * it is reversible: supabase/rollback/20261121110000_job_pricing_seal.down.sql copies the values back.
-- Dropping the columns is a later, optional clean-up.
--
-- Safety: before anything is emptied this checks that job_pricing holds every value (filling any gap from
-- the old columns) and ABORTS, changing nothing, if a job's old column disagrees with its pricing row.
-- Clearing a price is done by the app writing NULL to job_pricing itself (NULL over NULL on the sealed
-- column is no change, so no trigger could see it); the triggers only forward non-NULL values.
-- Re-runnable.

-- ── 1. Make sure job_pricing holds everything, and prove it ────────────────
INSERT INTO public.job_pricing
  (job_id, org_id, total_price, rate_per_mile, admin_rate, caz_ulez_cost,
   pricing_metadata, pricing_suggestion_used_at, pricing_suggestion_used_by)
SELECT j.id, j.org_id, j.total_price, j.rate_per_mile, j.admin_rate, j.caz_ulez_cost,
       j.pricing_metadata, j.pricing_suggestion_used_at, j.pricing_suggestion_used_by
  FROM public.jobs j
 WHERE j.total_price IS NOT NULL OR j.rate_per_mile IS NOT NULL OR j.admin_rate IS NOT NULL
    OR j.caz_ulez_cost IS NOT NULL OR j.pricing_metadata IS NOT NULL
    OR j.pricing_suggestion_used_at IS NOT NULL OR j.pricing_suggestion_used_by IS NOT NULL
ON CONFLICT (job_id) DO NOTHING;

-- Fill a value job_pricing is missing (never overwrite one it has).
UPDATE public.job_pricing p SET
  total_price = COALESCE(p.total_price, j.total_price),
  rate_per_mile = COALESCE(p.rate_per_mile, j.rate_per_mile),
  admin_rate = COALESCE(p.admin_rate, j.admin_rate),
  caz_ulez_cost = COALESCE(p.caz_ulez_cost, j.caz_ulez_cost),
  pricing_metadata = COALESCE(p.pricing_metadata, j.pricing_metadata),
  pricing_suggestion_used_at = COALESCE(p.pricing_suggestion_used_at, j.pricing_suggestion_used_at),
  pricing_suggestion_used_by = COALESCE(p.pricing_suggestion_used_by, j.pricing_suggestion_used_by)
  FROM public.jobs j
 WHERE j.id = p.job_id
   AND ((p.total_price IS NULL AND j.total_price IS NOT NULL)
     OR (p.rate_per_mile IS NULL AND j.rate_per_mile IS NOT NULL)
     OR (p.admin_rate IS NULL AND j.admin_rate IS NOT NULL)
     OR (p.caz_ulez_cost IS NULL AND j.caz_ulez_cost IS NOT NULL)
     OR (p.pricing_metadata IS NULL AND j.pricing_metadata IS NOT NULL)
     OR (p.pricing_suggestion_used_at IS NULL AND j.pricing_suggestion_used_at IS NOT NULL)
     OR (p.pricing_suggestion_used_by IS NULL AND j.pricing_suggestion_used_by IS NOT NULL));

DO $$
DECLARE v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.jobs j JOIN public.job_pricing p ON p.job_id = j.id
   WHERE (j.total_price IS NOT NULL AND j.total_price IS DISTINCT FROM p.total_price)
      OR (j.rate_per_mile IS NOT NULL AND j.rate_per_mile IS DISTINCT FROM p.rate_per_mile)
      OR (j.admin_rate IS NOT NULL AND j.admin_rate IS DISTINCT FROM p.admin_rate)
      OR (j.caz_ulez_cost IS NOT NULL AND j.caz_ulez_cost IS DISTINCT FROM p.caz_ulez_cost)
      OR (j.pricing_metadata IS NOT NULL AND j.pricing_metadata IS DISTINCT FROM p.pricing_metadata)
      OR (j.pricing_suggestion_used_at IS NOT NULL AND j.pricing_suggestion_used_at IS DISTINCT FROM p.pricing_suggestion_used_at)
      OR (j.pricing_suggestion_used_by IS NOT NULL AND j.pricing_suggestion_used_by IS DISTINCT FROM p.pricing_suggestion_used_by);
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'JOB_PRICING_MISMATCH: % job(s) hold a price on jobs that differs from job_pricing; no price column was emptied', v_bad
      USING HINT = 'Compare jobs and job_pricing for those rows and decide which is right, then re-run';
  END IF;
END $$;

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

-- ── 3. Empty the old columns ───────────────────────────────────────────────
-- The seal triggers do not fire for this (every NEW value is NULL). Rows are only touched if they hold
-- something, so a job with no pricing data is not rewritten.
UPDATE public.jobs SET
  total_price = NULL, rate_per_mile = NULL, admin_rate = NULL, caz_ulez_cost = NULL,
  pricing_metadata = NULL, pricing_suggestion_used_at = NULL, pricing_suggestion_used_by = NULL
 WHERE total_price IS NOT NULL OR rate_per_mile IS NOT NULL OR admin_rate IS NOT NULL
    OR caz_ulez_cost IS NOT NULL OR pricing_metadata IS NOT NULL
    OR pricing_suggestion_used_at IS NOT NULL OR pricing_suggestion_used_by IS NOT NULL;
