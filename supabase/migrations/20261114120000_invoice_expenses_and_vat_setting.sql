-- =====================================================================
-- Multi-job invoices with rechargeable expenses + a VAT registration switch
-- =====================================================================
-- WHY
--   1. Invoices only ever billed the job price. Expenses (fuel, tolls ...)
--      could not be recharged on the invoice, and the "receipts" download
--      bundled every receipt on the selected jobs, whether or not it was
--      billed. Nothing recorded which expense went on which invoice, so an
--      expense could be billed twice.
--   2. VAT was a free-typed rate defaulting to 20% on both invoice screens
--      (and in the invoices.vat_rate column default). A business that is not
--      VAT registered must not charge VAT at all.
--
-- WHAT
--   a. organisations.vat_registered  - the business-level VAT switch
--      (default false: no VAT is charged until it is turned on).
--   b. invoices: client_ref (the client's PO / reference), vat_registered
--      (snapshot of the switch at creation), expenses_total; the vat_rate
--      column default drops from 20 to 0.
--   c. clients.po_required - block invoicing this client without a PO.
--   d. expenses: supplier + vat_amount (needed to recharge net of VAT once
--      registered, and for accounting exports).
--   e. invoice_expenses - one row per expense recharged on an invoice, with
--      a SNAPSHOT of the expense (so later edits to the expense never change
--      an issued invoice) and its receipt reference (R01, R02 ...). A partial
--      UNIQUE index on expense_id is the authoritative double-billing guard.
--
-- Everything here is additive; no existing row is modified.
-- =====================================================================

-- a ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organisations.vat_registered IS
  'Business-level VAT switch. false = not VAT registered: invoices carry no VAT and expenses are recharged at the gross amount paid.';

-- b ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS client_ref text,
  ADD COLUMN IF NOT EXISTS vat_registered boolean,
  ADD COLUMN IF NOT EXISTS expenses_total numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.invoices ALTER COLUMN vat_rate SET DEFAULT 0;

COMMENT ON COLUMN public.invoices.client_ref IS 'Client''s own reference / purchase order number.';
COMMENT ON COLUMN public.invoices.vat_registered IS
  'Snapshot of organisations.vat_registered when the invoice was created. NULL on invoices that pre-date the switch.';
COMMENT ON COLUMN public.invoices.expenses_total IS
  'Rechargeable expenses included in subtotal (sum of invoice_expenses.amount_charged).';

-- c ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS po_required boolean NOT NULL DEFAULT false;

-- d ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS vat_amount numeric(10,2);

COMMENT ON COLUMN public.expenses.vat_amount IS
  'VAT included in amount, as shown on the receipt. NULL = not recorded.';

-- e ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  -- SET NULL: deleting the underlying expense (or its job) must never remove
  -- the line from an invoice; the snapshot columns below keep it complete.
  expense_id     uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  job_id         uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ref            text NOT NULL,                 -- R01, R02 ... fixed at creation
  sort_order     integer NOT NULL DEFAULT 0,
  -- snapshot of the expense at the moment it was invoiced
  expense_date   date NOT NULL,
  category       text NOT NULL,
  supplier       text,
  amount_gross   numeric(10,2) NOT NULL,        -- what was paid, incl. any VAT
  amount_vat     numeric(10,2) NOT NULL DEFAULT 0,
  amount_charged numeric(10,2) NOT NULL,        -- what the invoice recharges
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_expenses_ref_unique UNIQUE (invoice_id, ref)
);

CREATE INDEX IF NOT EXISTS idx_invoice_expenses_invoice_id ON public.invoice_expenses (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_expenses_job_id ON public.invoice_expenses (job_id);

-- An expense can be recharged on at most one invoice.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_expenses_expense_id_unique
  ON public.invoice_expenses (expense_id)
  WHERE expense_id IS NOT NULL;

ALTER TABLE public.invoice_expenses ENABLE ROW LEVEL SECURITY;

-- Same model as invoice_items: readable by the invoice's org, written by
-- admins only, always scoped through the parent invoice.
DROP POLICY IF EXISTS "invoice_expenses_select" ON public.invoice_expenses;
CREATE POLICY "invoice_expenses_select"
  ON public.invoice_expenses FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_expenses.invoice_id AND i.org_id = user_org_id()
    )
  );

DROP POLICY IF EXISTS "invoice_expenses_insert_admin" ON public.invoice_expenses;
CREATE POLICY "invoice_expenses_insert_admin"
  ON public.invoice_expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin() OR (
      is_admin_or_super_admin() AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_expenses.invoice_id AND i.org_id = user_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "invoice_expenses_update_admin" ON public.invoice_expenses;
CREATE POLICY "invoice_expenses_update_admin"
  ON public.invoice_expenses FOR UPDATE
  TO authenticated
  USING (
    is_super_admin() OR (
      is_admin_or_super_admin() AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_expenses.invoice_id AND i.org_id = user_org_id()
      )
    )
  )
  WITH CHECK (
    is_super_admin() OR (
      is_admin_or_super_admin() AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_expenses.invoice_id AND i.org_id = user_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "invoice_expenses_delete_admin" ON public.invoice_expenses;
CREATE POLICY "invoice_expenses_delete_admin"
  ON public.invoice_expenses FOR DELETE
  TO authenticated
  USING (
    is_super_admin() OR (
      is_admin_or_super_admin() AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_expenses.invoice_id AND i.org_id = user_org_id()
      )
    )
  );

-- The client portal reads invoices through SECURITY DEFINER functions and
-- gets line_items (which carries each job's expense summary), so portal
-- users need no direct access to this table.
REVOKE ALL ON public.invoice_expenses FROM anon;
