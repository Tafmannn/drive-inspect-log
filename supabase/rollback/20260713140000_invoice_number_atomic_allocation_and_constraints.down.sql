-- Rollback for 20260713140000_invoice_number_atomic_allocation_and_constraints.sql
-- Reverses, in dependency order: the partial unique index, the org/number
-- uniqueness constraint, the allocation RPC, and the per-org counter table.
-- Does NOT touch any existing invoices/invoice_items rows.

DROP INDEX IF EXISTS public.invoice_items_job_id_unique;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_org_number_unique;

DROP FUNCTION IF EXISTS public.allocate_invoice_number(uuid);

DROP TABLE IF EXISTS public.invoice_number_counters;
