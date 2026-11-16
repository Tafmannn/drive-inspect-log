-- Rollback for 20261114130000_invoice_lifecycle.sql
-- NOTE: refuses to run while credit notes or cancelled-and-released invoices
-- exist, because removing `voided` would make those jobs look double-invoiced.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.invoices WHERE document_type = 'credit_note')
     OR EXISTS (SELECT 1 FROM public.invoice_items WHERE voided)
     OR EXISTS (SELECT 1 FROM public.invoice_expenses WHERE voided) THEN
    RAISE EXCEPTION 'credit notes / voided lines exist; reconcile them before rolling back';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.cancel_invoice(uuid, text);
DROP FUNCTION IF EXISTS public.allocate_credit_note_number(uuid);

DROP TRIGGER IF EXISTS trg_invoice_expenses_guard_lifecycle ON public.invoice_expenses;
DROP TRIGGER IF EXISTS trg_invoice_items_guard_lifecycle ON public.invoice_items;
DROP FUNCTION IF EXISTS public.invoice_lines_guard_lifecycle();
DROP TRIGGER IF EXISTS trg_invoices_guard_lifecycle ON public.invoices;
DROP FUNCTION IF EXISTS public.invoices_guard_lifecycle();

DROP INDEX IF EXISTS public.invoice_expenses_expense_id_unique;
CREATE UNIQUE INDEX invoice_expenses_expense_id_unique
  ON public.invoice_expenses (expense_id) WHERE expense_id IS NOT NULL;
DROP INDEX IF EXISTS public.invoice_items_job_id_unique;
CREATE UNIQUE INDEX invoice_items_job_id_unique
  ON public.invoice_items (job_id) WHERE job_id IS NOT NULL;

ALTER TABLE public.invoice_expenses DROP COLUMN IF EXISTS voided;
ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS voided;
ALTER TABLE public.invoice_number_counters DROP COLUMN IF EXISTS last_credit_seq;

DROP INDEX IF EXISTS public.invoices_one_credit_note_per_invoice;
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_credit_note_link_check,
  DROP CONSTRAINT IF EXISTS invoices_document_type_check,
  DROP COLUMN IF EXISTS cancel_reason,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS payment_reference,
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS paid_at,
  DROP COLUMN IF EXISTS credits_invoice_id,
  DROP COLUMN IF EXISTS document_type;
