
-- ============================================================
-- Multi-job invoicing foundations
-- Non-destructive: adds new tables, extends existing invoices
-- ============================================================

-- 1. CLIENTS — reusable billing profiles, org-scoped
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  name text NOT NULL,
  company text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_org_id ON public.clients(org_id);
CREATE INDEX idx_clients_org_name ON public.clients(org_id, name);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage clients"
  ON public.clients FOR ALL
  TO authenticated
  USING (is_super_admin() OR org_id = user_org_id())
  WITH CHECK (is_super_admin() OR org_id = user_org_id());

CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. EXTEND INVOICES — add nullable client_id FK (non-destructive)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id);

CREATE INDEX idx_invoices_client_id ON public.invoices(client_id);

-- 3. INVOICE_ITEMS — one row per job/line on an invoice
CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id),
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_job_id ON public.invoice_items(job_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage invoice_items"
  ON public.invoice_items FOR ALL
  TO authenticated
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id()
    )
  );
