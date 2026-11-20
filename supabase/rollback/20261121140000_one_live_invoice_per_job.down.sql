-- Rollback for 20261121140000_one_live_invoice_per_job.sql
DROP TRIGGER IF EXISTS trg_invoices_one_live_per_job ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoice_items_one_live_per_job ON public.invoice_items;
DROP FUNCTION IF EXISTS public.guard_one_live_invoice_per_job();
