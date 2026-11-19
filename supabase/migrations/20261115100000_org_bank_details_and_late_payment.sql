-- =====================================================================
-- Bank details per organisation + the late-payment notice switch
-- =====================================================================
-- WHY
--   The bank account printed on every invoice was typed into the frontend
--   source (src/lib/invoicePdf.ts), so it could not differ per business,
--   could not be changed without a deploy, and sat in a public repository.
--
-- WHAT
--   a. organisations.bank_name / bank_account_name / bank_sort_code /
--      bank_account_number: where clients pay. All optional. Light format
--      checks (sort code NN-NN-NN, account number 6-8 digits).
--   b. organisations.late_payment_notice: print the statutory late-payment
--      sentence on invoices (Late Payment of Commercial Debts (Interest)
--      Act 1998; business clients only). Default true.
--   c. portal_get_invoice() also returns these on `operator`, so the client
--      portal can rebuild an invoice PDF that was issued before PDFs were
--      stored. Same access rule as before: the caller's own sent invoices.
--
-- This migration deliberately contains NO bank details. They are entered
-- in the organisation profile (super admin), where RLS protects them.
-- Additive; no existing row changes.
-- =====================================================================

-- a ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_sort_code text,
  ADD COLUMN IF NOT EXISTS bank_account_number text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organisations_bank_sort_code_format') THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_bank_sort_code_format
      CHECK (bank_sort_code IS NULL OR bank_sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organisations_bank_account_number_format') THEN
    ALTER TABLE public.organisations
      ADD CONSTRAINT organisations_bank_account_number_format
      CHECK (bank_account_number IS NULL OR bank_account_number ~ '^[0-9]{6,8}$');
  END IF;
END $$;

COMMENT ON COLUMN public.organisations.bank_sort_code IS 'UK sort code, NN-NN-NN. Printed on invoices.';
COMMENT ON COLUMN public.organisations.bank_account_number IS 'UK account number, 6-8 digits. Printed on invoices.';

-- b ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS late_payment_notice boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organisations.late_payment_notice IS
  'Print the statutory late-payment sentence on invoices. Applies to business clients only.';

-- c ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_get_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid uuid := public.portal_client_id();
  v_org uuid;
  v jsonb;
BEGIN
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM public.clients WHERE id = v_cid;

  SELECT jsonb_build_object(
    'id', inv.id,
    'invoice_number', inv.invoice_number,
    'issue_date', inv.issue_date,
    'due_date', inv.due_date,
    'payment_terms', inv.payment_terms,
    'client_name', inv.client_name,
    'client_company', inv.client_company,
    'client_email', inv.client_email,
    'client_address', inv.client_address,
    'notes', inv.notes,
    'subtotal', inv.subtotal,
    'vat_rate', inv.vat_rate,
    'vat_amount', inv.vat_amount,
    'total', inv.total,
    'sent_at', inv.sent_at,
    'status', inv.status,
    'document_type', inv.document_type,
    'paid_at', inv.paid_at,
    'client_ref', inv.client_ref,
    'vat_registered', inv.vat_registered,
    -- The storage path itself stays server-side knowledge the client does
    -- not need to guess: it is returned only so the portal can download
    -- the object, and the storage policy below is what authorises that.
    'pdf_path', inv.pdf_url,
    'credits_invoice_number', (SELECT o.invoice_number FROM public.invoices o
                               WHERE o.id = inv.credits_invoice_id AND o.client_id = v_cid),
    'job_ref', (SELECT COALESCE(NULLIF(j.external_job_number, ''), upper(left(j.id::text, 8)))
                FROM public.jobs j WHERE j.id = inv.job_id AND j.client_id = v_cid),
    'vehicle_reg', (SELECT j.vehicle_reg FROM public.jobs j WHERE j.id = inv.job_id AND j.client_id = v_cid),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'description', it.description,
        'quantity', it.quantity,
        'unit_price', it.unit_price,
        'amount', it.amount
      ) ORDER BY it.sort_order)
      FROM public.invoice_items it
      WHERE it.invoice_id = inv.id
    ), '[]'::jsonb),
    'line_items', inv.line_items,
    'operator', jsonb_build_object(
      'name', COALESCE(NULLIF(o.branding_name, ''), o.name),
      'legal_name', o.legal_name,
      'logo_url', o.logo_url,
      'registered_address', o.registered_address,
      'vat_number', o.vat_number,
      'company_number', o.company_number,
      'bank_name', o.bank_name,
      'bank_account_name', o.bank_account_name,
      'bank_sort_code', o.bank_sort_code,
      'bank_account_number', o.bank_account_number,
      'late_payment_notice', o.late_payment_notice
    )
  )
  INTO v
  FROM public.invoices inv
  JOIN public.organisations o ON o.id = inv.org_id
  WHERE inv.id = p_invoice_id
    AND inv.client_id = v_cid
    AND inv.org_id = v_org
    AND inv.sent_at IS NOT NULL;

  IF v IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_get_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_get_invoice(uuid) TO authenticated;
