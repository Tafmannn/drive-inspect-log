-- Rollback for 20261114120000_invoice_expenses_and_vat_setting.sql
-- WARNING: drops invoice_expenses (which expense was billed on which invoice)
-- and the new columns, including any data entered into them. Roll back
-- 20261114130000_invoice_lifecycle first.
DROP TABLE IF EXISTS public.invoice_expenses;
ALTER TABLE public.expenses DROP COLUMN IF EXISTS vat_amount, DROP COLUMN IF EXISTS supplier;
ALTER TABLE public.clients DROP COLUMN IF EXISTS po_required;
ALTER TABLE public.invoices ALTER COLUMN vat_rate SET DEFAULT 20;
ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS expenses_total,
  DROP COLUMN IF EXISTS vat_registered,
  DROP COLUMN IF EXISTS client_ref;
ALTER TABLE public.organisations DROP COLUMN IF EXISTS vat_registered;
