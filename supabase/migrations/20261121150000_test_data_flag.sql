-- Test-data flag: jobs, invoices and expenses can be marked as TEST data so reports leave them out.
--
-- Why: the app has been in testing, and the numbers (weekly figures, profitability, Invoice Prep, the accountant
-- pack, the Attention Center billing checks) should reflect real work only. Deleting the old records would lose
-- history and cannot be undone; hiding them (is_hidden) would remove them from every screen. A flag keeps the data
-- and lets each report decide.
--
-- THIS MIGRATION ONLY ADDS THE COLUMNS (all false) AND KEEPS NEW RECORDS CONSISTENT. It does not mark anything.
-- Which records are test data is a one-off data change, run separately (see the production SQL that goes with
-- this release), so re-running a migration can never re-flag records.
--
-- Inheritance: an expense added to a test job, or an invoice raised for a test job, is test data too, so a late
-- edit to an old test job cannot put a stray figure into a report.
--
-- The flag is not touched by the invoice lifecycle guard (it only freezes the invoice's own content), so it can be
-- set on an issued invoice. Re-runnable.

ALTER TABLE public.jobs     ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.inherit_is_test_from_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.job_id IS NOT NULL AND NOT NEW.is_test THEN
    NEW.is_test := COALESCE((SELECT j.is_test FROM public.jobs j WHERE j.id = NEW.job_id), false);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.inherit_is_test_from_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_expenses_inherit_is_test ON public.expenses;
CREATE TRIGGER trg_expenses_inherit_is_test
  BEFORE INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.inherit_is_test_from_job();

DROP TRIGGER IF EXISTS trg_invoices_inherit_is_test ON public.invoices;
CREATE TRIGGER trg_invoices_inherit_is_test
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.inherit_is_test_from_job();
