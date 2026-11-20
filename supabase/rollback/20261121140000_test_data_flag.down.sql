-- Rollback for 20261121140000_test_data_flag.sql.
-- Removes the inheritance triggers, the function and the three is_test columns. WARNING: dropping the columns
-- discards which records were marked as test data (the records themselves are untouched). Export first if you need
-- the list: SELECT id FROM public.jobs WHERE is_test.
BEGIN;

DROP TRIGGER IF EXISTS trg_expenses_inherit_is_test ON public.expenses;
DROP TRIGGER IF EXISTS trg_invoices_inherit_is_test ON public.invoices;
DROP FUNCTION IF EXISTS public.inherit_is_test_from_job();

ALTER TABLE public.jobs     DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS is_test;
ALTER TABLE public.expenses DROP COLUMN IF EXISTS is_test;

COMMIT;
