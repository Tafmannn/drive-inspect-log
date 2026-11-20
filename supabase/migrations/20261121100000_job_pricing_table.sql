-- Phase 1 of moving job prices out of `jobs` (see docs/security/job-pricing-split.md).
--
-- Drivers can read every column of their own jobs, including the price fields. Row-level security
-- cannot hide a column from one role and not another, so the price data moves to its own table that
-- only admins can see. THIS MIGRATION CHANGES NOTHING VISIBLE: it adds the table, copies the data
-- across, and mirrors any later change to the old columns into it. The old columns are untouched and
-- still hold the data, so the current app keeps working exactly as before.
--
--   public.job_pricing   one row per job (job_id is the key); admins / super admin of the same
--                        organisation only. A driver gets no rows.
--   backfill             every job that has any of the seven fields set (20 of 76 today).
--   mirror triggers      a change made to the old columns (by the current app, or an old browser tab)
--                        is copied into job_pricing. On UPDATE only the columns that actually changed
--                        are copied, so an unrelated edit can never overwrite a newer value that was
--                        written to job_pricing directly.
--
-- Phase 2 switches the app to read and write job_pricing. Phase 3 seals the old columns.
-- Re-runnable at any time: the copy never overwrites an existing job_pricing row, so running it again
-- after phase 2 cannot replace a newer price with an older one. Rollback drops the table and the mirror;
-- the old columns were never changed.

CREATE TABLE IF NOT EXISTS public.job_pricing (
  job_id                      uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  org_id                      uuid NOT NULL,
  total_price                 numeric,
  rate_per_mile               numeric,
  admin_rate                  numeric(10,2),
  caz_ulez_cost               numeric,
  pricing_metadata            jsonb,
  pricing_suggestion_used_at  timestamptz,
  pricing_suggestion_used_by  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_pricing_org_idx ON public.job_pricing (org_id);

DROP TRIGGER IF EXISTS update_job_pricing_updated_at ON public.job_pricing;
CREATE TRIGGER update_job_pricing_updated_at
  BEFORE UPDATE ON public.job_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.job_pricing ENABLE ROW LEVEL SECURITY;

-- Admins and the super admin only, and only within their own organisation (the super admin sees all).
DROP POLICY IF EXISTS job_pricing_select_admin ON public.job_pricing;
CREATE POLICY job_pricing_select_admin ON public.job_pricing FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id()));

DROP POLICY IF EXISTS job_pricing_insert_admin ON public.job_pricing;
CREATE POLICY job_pricing_insert_admin ON public.job_pricing FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id()));

DROP POLICY IF EXISTS job_pricing_update_admin ON public.job_pricing;
CREATE POLICY job_pricing_update_admin ON public.job_pricing FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id()));

DROP POLICY IF EXISTS job_pricing_delete_admin ON public.job_pricing;
CREATE POLICY job_pricing_delete_admin ON public.job_pricing FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id()));

REVOKE ALL ON public.job_pricing FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_pricing TO authenticated;

-- ── Backfill: copy what the jobs hold today ────────────────────────────────
INSERT INTO public.job_pricing
  (job_id, org_id, total_price, rate_per_mile, admin_rate, caz_ulez_cost,
   pricing_metadata, pricing_suggestion_used_at, pricing_suggestion_used_by)
SELECT j.id, j.org_id, j.total_price, j.rate_per_mile, j.admin_rate, j.caz_ulez_cost,
       j.pricing_metadata, j.pricing_suggestion_used_at, j.pricing_suggestion_used_by
  FROM public.jobs j
 WHERE j.total_price IS NOT NULL OR j.rate_per_mile IS NOT NULL OR j.admin_rate IS NOT NULL
    OR j.caz_ulez_cost IS NOT NULL OR j.pricing_metadata IS NOT NULL
    OR j.pricing_suggestion_used_at IS NOT NULL OR j.pricing_suggestion_used_by IS NOT NULL
ON CONFLICT (job_id) DO NOTHING;  -- never overwrite a row that already exists (it may hold newer prices)

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
