-- Phase 4 of moving job prices out of `jobs` (see docs/security/job-pricing-split.md): DROP the sealed columns.
--
-- Phase 3 emptied total_price, rate_per_mile, admin_rate, caz_ulez_cost, pricing_metadata,
-- pricing_suggestion_used_at and pricing_suggestion_used_by on `jobs`. All prices live in public.job_pricing
-- (admin-only). This removes the empty columns and the seal triggers that guarded them.
--
-- DEPLOY THE APP FIRST. The code from the same release no longer names these columns on `jobs`
-- (selects, inserts and updates all go through job_pricing). Running this before that code is live makes any
-- old browser tab or deployment that still selects/writes them fail with "column does not exist".
--
-- Safety: it ABORTS, changing nothing, if
--   * any job still holds a value in one of the columns (so no price can be lost), or
--   * an index or constraint on `jobs` uses one of the columns (a drop would silently remove it; the rollback
--     could not restore it).
-- It does NOT use CASCADE: a view, policy or function that depends on a column makes the drop fail rather than
-- being dropped with it.
--
-- Reversible: supabase/rollback/20261121120000_job_pricing_drop_columns.down.sql re-adds the (empty) columns and
-- restores the seal, i.e. the state after phase 3. The prices themselves are never touched (they are in
-- job_pricing). Re-runnable.

DO $$
DECLARE
  v_cols constant text[] := ARRAY['total_price','rate_per_mile','admin_rate','caz_ulez_cost',
                                  'pricing_metadata','pricing_suggestion_used_at','pricing_suggestion_used_by'];
  v_rows integer; v_idx integer; v_con integer; v_present integer;
BEGIN
  SELECT count(*) INTO v_present FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = ANY (v_cols);

  IF v_present > 0 THEN
    -- Counting rows needs the columns to exist; the check below is skipped on a re-run after the drop.
    EXECUTE 'SELECT count(*) FROM public.jobs WHERE '
         || array_to_string(ARRAY(SELECT format('%I IS NOT NULL', c) FROM unnest(v_cols) c
                                   WHERE c IN (SELECT column_name FROM information_schema.columns
                                                WHERE table_schema = 'public' AND table_name = 'jobs')), ' OR ')
      INTO v_rows;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'JOBS_STILL_HOLD_PRICES: % job(s) still hold a value in a price column; nothing was dropped', v_rows
        USING HINT = 'Run the phase 3 seal first, or compare jobs and job_pricing for those rows';
    END IF;

    SELECT count(*) INTO v_idx
      FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
     WHERE i.indrelid = 'public.jobs'::regclass AND a.attname = ANY (v_cols);
    SELECT count(*) INTO v_con
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.jobs'::regclass AND a.attname = ANY (v_cols);
    IF v_idx + v_con > 0 THEN
      RAISE EXCEPTION 'PRICE_COLUMN_HAS_INDEX_OR_CONSTRAINT: % index(es) and % constraint(s) use a price column; nothing was dropped', v_idx, v_con
        USING HINT = 'Decide whether to recreate them on job_pricing, then add them to the rollback and re-run';
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_seal_job_pricing_ins ON public.jobs;
DROP TRIGGER IF EXISTS trg_seal_job_pricing_upd ON public.jobs;
DROP FUNCTION IF EXISTS public.seal_job_pricing_before_update();
DROP FUNCTION IF EXISTS public.seal_job_pricing_after_insert();

ALTER TABLE public.jobs
  DROP COLUMN IF EXISTS total_price,
  DROP COLUMN IF EXISTS rate_per_mile,
  DROP COLUMN IF EXISTS admin_rate,
  DROP COLUMN IF EXISTS caz_ulez_cost,
  DROP COLUMN IF EXISTS pricing_metadata,
  DROP COLUMN IF EXISTS pricing_suggestion_used_at,
  DROP COLUMN IF EXISTS pricing_suggestion_used_by;
