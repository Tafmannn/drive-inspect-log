-- Rollback for 20261121100000_job_pricing_table.sql (phase 1 of the job-pricing split).
-- Removes the job_pricing table and the mirror. The old price columns on `jobs` were never changed by the
-- migration, so they still hold the prices. WARNING: if the app has already been switched to job_pricing
-- (phase 2) and prices were edited since, those edits live ONLY in job_pricing: copy them back first, e.g.
--   UPDATE public.jobs j SET total_price = p.total_price, rate_per_mile = p.rate_per_mile,
--          admin_rate = p.admin_rate, caz_ulez_cost = p.caz_ulez_cost, pricing_metadata = p.pricing_metadata,
--          pricing_suggestion_used_at = p.pricing_suggestion_used_at, pricing_suggestion_used_by = p.pricing_suggestion_used_by
--     FROM public.job_pricing p WHERE p.job_id = j.id;
BEGIN;

DROP TRIGGER IF EXISTS trg_mirror_job_pricing_ins ON public.jobs;
DROP TRIGGER IF EXISTS trg_mirror_job_pricing_upd ON public.jobs;
DROP FUNCTION IF EXISTS public.mirror_job_pricing_from_jobs();
DROP TABLE IF EXISTS public.job_pricing;

COMMIT;
