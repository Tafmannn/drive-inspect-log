-- =====================================================================
-- Invoice lifecycle: issue -> paid, immutability once issued, cancel/credit
-- =====================================================================
-- WHY
--   Every invoice stayed 'draft' forever. Nothing recorded that an invoice
--   was issued or paid, an issued invoice could still be edited or deleted
--   (breaking the audit trail and the number sequence), and the only way to
--   correct one was to change it in place.
--
-- WHAT
--   a. invoices: payment + cancellation columns, document_type
--      ('invoice' | 'credit_note') and credits_invoice_id.
--   b. Stamping sent_at moves a draft to 'sent' (so the existing
--      send-invoice-email edge function needs no change).
--   c. Once an invoice has left 'draft' its content is frozen, and it cannot
--      be deleted. Only lifecycle fields (status, payment, cancellation, the
--      stored PDF path) may change. Same for its items and expense lines.
--   d. invoice_items / invoice_expenses gain `voided`; the "one invoice per
--      job / per expense" unique indexes ignore voided rows, so cancelling
--      an invoice releases its jobs and expenses to be invoiced again while
--      the cancelled invoice keeps its full history.
--   e. cancel_invoice(): a draft is simply cancelled; an issued invoice is
--      cancelled by an automatically created CREDIT NOTE for the full
--      amount (its own CN number sequence).
--
-- Existing rows: untouched, except that the unique index on
-- invoice_items(job_id) is recreated with the extra `NOT voided` condition
-- (identical behaviour for existing rows, which are all voided = false).
-- =====================================================================

-- a ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'invoice',
  ADD COLUMN IF NOT EXISTS credits_invoice_id uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_document_type_check') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_document_type_check
      CHECK (document_type IN ('invoice', 'credit_note'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_credit_note_link_check') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_credit_note_link_check
      CHECK ((document_type = 'credit_note') = (credits_invoice_id IS NOT NULL));
  END IF;
END $$;

-- An invoice can be credited at most once (full credit notes only).
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_credit_note_per_invoice
  ON public.invoices (credits_invoice_id)
  WHERE credits_invoice_id IS NOT NULL;

ALTER TABLE public.invoice_number_counters
  ADD COLUMN IF NOT EXISTS last_credit_seq integer NOT NULL DEFAULT 0;

-- d (columns + indexes) ─────────────────────────────────────────────────
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoice_expenses
  ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS public.invoice_items_job_id_unique;
CREATE UNIQUE INDEX invoice_items_job_id_unique
  ON public.invoice_items (job_id)
  WHERE job_id IS NOT NULL AND NOT voided;

DROP INDEX IF EXISTS public.invoice_expenses_expense_id_unique;
CREATE UNIQUE INDEX invoice_expenses_expense_id_unique
  ON public.invoice_expenses (expense_id)
  WHERE expense_id IS NOT NULL AND NOT voided;

-- b + c ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoices_guard_lifecycle()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $function$
BEGIN
  IF tg_op = 'DELETE' THEN
    IF old.status <> 'draft' THEN
      RAISE EXCEPTION 'invoice % has been issued and cannot be deleted; cancel it instead', old.invoice_number
        USING ERRCODE = '23514';
    END IF;
    RETURN old;
  END IF;

  -- Stamping sent_at issues the invoice.
  IF old.status = 'draft' AND new.status = 'draft'
     AND old.sent_at IS NULL AND new.sent_at IS NOT NULL THEN
    new.status := 'sent';
  END IF;
  IF new.status = 'sent' AND old.status = 'draft' AND new.sent_at IS NULL THEN
    new.sent_at := now();
  END IF;

  IF old.status = 'draft' THEN
    RETURN new;
  END IF;

  -- Issued: no way back to draft, and a cancelled invoice stays cancelled.
  IF new.status = 'draft' THEN
    RAISE EXCEPTION 'invoice % has been issued and cannot return to draft', old.invoice_number
      USING ERRCODE = '23514';
  END IF;
  IF old.status = 'cancelled' AND new.status <> 'cancelled' THEN
    RAISE EXCEPTION 'invoice % is cancelled and cannot be reopened', old.invoice_number
      USING ERRCODE = '23514';
  END IF;

  -- Issued: the document itself is frozen.
  IF (new.org_id, new.invoice_number, new.document_type, new.client_name, new.issue_date,
      new.line_items, new.subtotal, new.total, new.expenses_total)
     IS DISTINCT FROM
     (old.org_id, old.invoice_number, old.document_type, old.client_name, old.issue_date,
      old.line_items, old.subtotal, old.total, old.expenses_total)
     OR new.job_id IS DISTINCT FROM old.job_id AND new.job_id IS NOT NULL
     OR new.client_id IS DISTINCT FROM old.client_id
     OR new.client_email IS DISTINCT FROM old.client_email
     OR new.client_address IS DISTINCT FROM old.client_address
     OR new.client_company IS DISTINCT FROM old.client_company
     OR new.client_ref IS DISTINCT FROM old.client_ref
     OR new.due_date IS DISTINCT FROM old.due_date
     OR new.vat_rate IS DISTINCT FROM old.vat_rate
     OR new.vat_amount IS DISTINCT FROM old.vat_amount
     OR new.vat_registered IS DISTINCT FROM old.vat_registered
     OR new.notes IS DISTINCT FROM old.notes
     OR new.payment_terms IS DISTINCT FROM old.payment_terms
     OR new.credits_invoice_id IS DISTINCT FROM old.credits_invoice_id
  THEN
    RAISE EXCEPTION 'invoice % has been issued and its contents cannot be changed; cancel it and raise a new one', old.invoice_number
      USING ERRCODE = '23514';
  END IF;

  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invoices_guard_lifecycle ON public.invoices;
CREATE TRIGGER trg_invoices_guard_lifecycle
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_guard_lifecycle();

-- Lines of an issued invoice are frozen too. The only permitted changes are
-- the ones the system itself makes: `voided` (on cancel) and the FK columns
-- going NULL when the underlying job / expense is deleted.
CREATE OR REPLACE FUNCTION public.invoice_lines_guard_lifecycle()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $function$
DECLARE
  v_invoice_id uuid := CASE WHEN tg_op = 'INSERT' THEN new.invoice_id ELSE old.invoice_id END;
  v_status text;
  v_new jsonb;
  v_old jsonb;
BEGIN
  SELECT i.status INTO v_status FROM public.invoices i WHERE i.id = v_invoice_id;

  -- Parent gone (cascade from deleting a draft) or still a draft: free.
  IF v_status IS NULL OR v_status = 'draft' THEN
    RETURN CASE WHEN tg_op = 'DELETE' THEN old ELSE new END;
  END IF;

  IF tg_op = 'UPDATE' THEN
    v_new := to_jsonb(new) - 'voided';
    v_old := to_jsonb(old) - 'voided';
    IF new.job_id IS NULL THEN
      v_new := v_new - 'job_id'; v_old := v_old - 'job_id';
    END IF;
    IF tg_table_name = 'invoice_expenses' AND (v_new ->> 'expense_id') IS NULL THEN
      v_new := v_new - 'expense_id'; v_old := v_old - 'expense_id';
    END IF;
    IF v_new = v_old THEN
      RETURN new;
    END IF;
  END IF;

  RAISE EXCEPTION 'this invoice has been issued and its lines cannot be changed'
    USING ERRCODE = '23514';
END;
$function$;

DROP TRIGGER IF EXISTS trg_invoice_items_guard_lifecycle ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_guard_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_lines_guard_lifecycle();

DROP TRIGGER IF EXISTS trg_invoice_expenses_guard_lifecycle ON public.invoice_expenses;
CREATE TRIGGER trg_invoice_expenses_guard_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_lines_guard_lifecycle();

-- e ─────────────────────────────────────────────────────────────────────
-- Credit note numbers: own per-org sequence, CN<yy>-0001.
CREATE OR REPLACE FUNCTION public.allocate_credit_note_number(p_org_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $function$
DECLARE
  v_seq integer;
BEGIN
  IF NOT (public.is_super_admin()
          OR (p_org_id = public.user_org_id() AND public.is_admin_or_super_admin())) THEN
    RAISE EXCEPTION 'not authorised to allocate credit note numbers for org %', p_org_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.invoice_number_counters (org_id, last_credit_seq)
  VALUES (p_org_id, 1)
  ON CONFLICT (org_id)
    DO UPDATE SET last_credit_seq = public.invoice_number_counters.last_credit_seq + 1
  RETURNING last_credit_seq INTO v_seq;

  RETURN 'CN' || to_char(now(), 'YY') || '-' || lpad(v_seq::text, 4, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.allocate_credit_note_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_credit_note_number(uuid) TO authenticated;

-- Cancel an invoice. SECURITY INVOKER: every statement runs under the
-- caller's RLS, so only an admin of the invoice's org can do this.
--   draft          -> cancelled (it was never issued; no credit note)
--   sent / paid    -> cancelled + a credit note for the full amount
-- Either way its jobs and expenses are released for re-invoicing.
-- Returns the credit note id, or NULL when none was needed.
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $function$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_credit_id uuid;
  v_number text;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'only admins can cancel invoices' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'a reason is required to cancel an invoice' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.document_type <> 'invoice' THEN
    RAISE EXCEPTION 'a credit note cannot be cancelled' USING ERRCODE = '23514';
  END IF;
  IF v_inv.status = 'cancelled' THEN
    RAISE EXCEPTION 'invoice % is already cancelled', v_inv.invoice_number USING ERRCODE = '23514';
  END IF;

  IF v_inv.status <> 'draft' THEN
    v_number := public.allocate_credit_note_number(v_inv.org_id);

    INSERT INTO public.invoices (
      org_id, client_id, client_name, client_company, client_email, client_address,
      invoice_number, document_type, credits_invoice_id, issue_date,
      line_items, subtotal, vat_rate, vat_amount, total, expenses_total,
      vat_registered, client_ref, notes, payment_terms, status
    )
    VALUES (
      v_inv.org_id, v_inv.client_id, v_inv.client_name, v_inv.client_company,
      v_inv.client_email, v_inv.client_address,
      v_number, 'credit_note', v_inv.id, CURRENT_DATE,
      v_inv.line_items, -v_inv.subtotal, v_inv.vat_rate, -COALESCE(v_inv.vat_amount, 0),
      -v_inv.total, -v_inv.expenses_total,
      v_inv.vat_registered, v_inv.client_ref,
      'Credit note for invoice ' || v_inv.invoice_number || '. Reason: ' || v_reason,
      NULL, 'draft'
    )
    RETURNING id INTO v_credit_id;

    -- Issue it immediately: a credit note is never a work in progress.
    UPDATE public.invoices SET status = 'sent', sent_at = now() WHERE id = v_credit_id;
  END IF;

  UPDATE public.invoices
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
   WHERE id = v_inv.id;

  UPDATE public.invoice_items SET voided = true WHERE invoice_id = v_inv.id AND NOT voided;
  UPDATE public.invoice_expenses SET voided = true WHERE invoice_id = v_inv.id AND NOT voided;

  RETURN v_credit_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid, text) TO authenticated;
