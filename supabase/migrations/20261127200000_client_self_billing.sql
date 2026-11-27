-- Self-billing clients (e.g. Movex): the client raises the invoice for our work through
-- their own platform and pays it; we never invoice them.
--
--   clients.billing_method
--     'we_invoice'  : we raise the invoice (every existing client; nothing changes).
--     'self_billed' : the client invoices themselves. Their jobs are left out of
--                     Invoice Prep, "Ready to bill" and the unbilled counts.
--
--   invoices.self_billed
--     A record of the client's own (paid) invoice, so the income is in the accounts
--     and the jobs count as invoiced. Only record_self_billed_invoice() can create
--     one, and the flag can never be added to or removed from an invoice afterwards.
--
-- Expand-only: two defaulted columns, one trigger, one function. The app live before
-- this migration ignores them; the app after it reads them. Re-runnable.

BEGIN;

-- ── clients.billing_method ────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_method text NOT NULL DEFAULT 'we_invoice';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clients'::regclass AND conname = 'clients_billing_method_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_billing_method_check CHECK (billing_method IN ('we_invoice', 'self_billed'));
  END IF;
END $$;

COMMENT ON COLUMN public.clients.billing_method IS
  'we_invoice = we raise invoices; self_billed = the client invoices themselves (record theirs with record_self_billed_invoice)';

-- ── invoices.self_billed ──────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS self_billed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.invoices.self_billed IS
  'true = a record of the client''s own paid invoice (self-billing), created only by record_self_billed_invoice';

-- ── record_self_billed_invoice ────────────────────────────────────────────
-- p_lines: [{"job_id": uuid, "amount": number}, ...] — the amount the client paid per job.
CREATE OR REPLACE FUNCTION public.record_self_billed_invoice(
  p_client_id uuid,
  p_invoice_number text,
  p_issue_date date,
  p_paid_at date,
  p_lines jsonb,
  p_pdf_path text,
  p_payment_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_number text := btrim(coalesce(p_invoice_number, ''));
  v_path text := btrim(coalesce(p_pdf_path, ''));
  v_line jsonb;
  v_job public.jobs%ROWTYPE;
  v_job_id uuid;
  v_amount numeric;
  v_total numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_seen uuid[] := '{}';
  v_ref text;
  v_i int := 0;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND OR (v_client.org_id IS DISTINCT FROM public.user_org_id() AND NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'CLIENT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_client.billing_method <> 'self_billed' THEN
    RAISE EXCEPTION 'CLIENT_NOT_SELF_BILLING: % is set to be invoiced by us', coalesce(v_client.company, v_client.name)
      USING ERRCODE = '23514';
  END IF;
  -- Self-billed VAT has its own rules (a self-billing agreement, the client accounts for
  -- it). Until that is designed, refuse rather than record a wrong VAT figure.
  IF (SELECT vat_registered FROM public.organisations WHERE id = v_client.org_id) THEN
    RAISE EXCEPTION 'SELF_BILL_VAT_NOT_SUPPORTED' USING ERRCODE = '23514';
  END IF;

  IF char_length(v_number) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'SELF_BILL_NUMBER_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF p_issue_date IS NULL OR p_issue_date > current_date THEN
    RAISE EXCEPTION 'SELF_BILL_DATE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF p_paid_at IS NULL OR p_paid_at > current_date THEN
    RAISE EXCEPTION 'SELF_BILL_PAID_DATE_INVALID' USING ERRCODE = '23514';
  END IF;
  -- Their PDF must already be in this organisation's self-billed folder.
  IF v_path NOT LIKE v_client.org_id::text || '/self-billed/%' OR v_path LIKE '%..%' THEN
    RAISE EXCEPTION 'SELF_BILL_PDF_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'SELF_BILL_LINES_REQUIRED' USING ERRCODE = '23514';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_job_id := (v_line->>'job_id')::uuid;
    v_amount := round((v_line->>'amount')::numeric, 2);
    IF v_job_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'SELF_BILL_LINE_INVALID' USING ERRCODE = '23514';
    END IF;
    IF v_job_id = ANY (v_seen) THEN
      RAISE EXCEPTION 'SELF_BILL_DUPLICATE_JOB' USING ERRCODE = '23514';
    END IF;
    v_seen := v_seen || v_job_id;

    SELECT * INTO v_job FROM public.jobs WHERE id = v_job_id;
    IF NOT FOUND OR v_job.org_id IS DISTINCT FROM v_client.org_id OR v_job.client_id IS DISTINCT FROM p_client_id THEN
      RAISE EXCEPTION 'SELF_BILL_JOB_NOT_THIS_CLIENT' USING ERRCODE = '23514';
    END IF;
    IF v_job.status NOT IN ('completed', 'closed', 'aborted') OR v_job.is_hidden THEN
      RAISE EXCEPTION 'SELF_BILL_JOB_NOT_BILLABLE: %', coalesce(v_job.external_job_number, v_job.id::text)
        USING ERRCODE = '23514';
    END IF;

    v_ref := coalesce(v_job.external_job_number, left(v_job.id::text, 8));
    -- Clear message up front; the invoice_items unique index / triggers remain the real guard.
    IF EXISTS (SELECT 1 FROM public.invoice_items ii JOIN public.invoices i ON i.id = ii.invoice_id
                WHERE ii.job_id = v_job.id AND NOT ii.voided AND i.status <> 'cancelled')
       OR EXISTS (SELECT 1 FROM public.invoices i
                   WHERE i.job_id = v_job.id AND i.status <> 'cancelled' AND i.document_type = 'invoice') THEN
      RAISE EXCEPTION 'JOB_ALREADY_INVOICED: % is already on an invoice', v_ref USING ERRCODE = '23505';
    END IF;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'job_id', v_job.id, 'job_ref', v_ref,
      'description', v_ref || ' ' || coalesce(v_job.vehicle_reg, ''),
      'quantity', 1, 'amount', v_amount, 'sort_order', v_i));
    v_total := v_total + v_amount;
    v_i := v_i + 1;
  END LOOP;

  BEGIN
    INSERT INTO public.invoices (
      org_id, client_id, client_name, client_company, client_email, client_address,
      invoice_number, issue_date, due_date, payment_terms, subtotal, expenses_total,
      vat_registered, vat_rate, vat_amount, total, line_items, notes, status, self_billed, pdf_url)
    VALUES (
      v_client.org_id, v_client.id, v_client.name, v_client.company,
      coalesce(v_client.billing_email, v_client.email), coalesce(v_client.billing_address, v_client.address),
      v_number, p_issue_date, NULL, NULL, v_total, 0,
      false, 0, 0, v_total, v_items, nullif(btrim(coalesce(p_notes, '')), ''), 'draft', true, v_path)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SELF_BILL_NUMBER_IN_USE: invoice number % is already recorded', v_number USING ERRCODE = '23505';
  END;

  -- One live invoice per job and the Abort fee ceiling are enforced by the
  -- invoice_items triggers, exactly as for our own invoices.
  INSERT INTO public.invoice_items (invoice_id, job_id, description, quantity, unit_price, amount, sort_order)
  SELECT v_id, (e->>'job_id')::uuid, e->>'description', 1, (e->>'amount')::numeric, (e->>'amount')::numeric,
         (e->>'sort_order')::int
    FROM jsonb_array_elements(v_items) e;

  -- Their invoice is already issued and paid.
  UPDATE public.invoices
     SET status = 'paid', sent_at = now(), paid_at = p_paid_at, payment_method = 'bank_transfer',
         payment_reference = nullif(btrim(coalesce(p_payment_reference, '')), '')
   WHERE id = v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.record_self_billed_invoice(uuid, text, date, date, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_self_billed_invoice(uuid, text, date, date, jsonb, text, text, text) TO authenticated;

-- ── the flag is only ever set by the function above ───────────────────────
CREATE OR REPLACE FUNCTION public.guard_invoice_self_billed_flag()
RETURNS trigger LANGUAGE plpgsql SET search_path TO public AS $$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc
   WHERE oid = 'public.record_self_billed_invoice(uuid,text,date,date,jsonb,text,text,text)'::regprocedure;
  IF TG_OP = 'INSERT' THEN
    IF NEW.self_billed AND current_user IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'SELF_BILL_DIRECT_WRITE_DENIED' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.self_billed IS DISTINCT FROM OLD.self_billed THEN
    RAISE EXCEPTION 'SELF_BILL_FLAG_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_self_billed_flag ON public.invoices;
CREATE TRIGGER trg_invoices_self_billed_flag
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_self_billed_flag();

COMMIT;
