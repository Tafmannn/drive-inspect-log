-- =====================================================================
-- Client portal: invoice status, credit notes, and the issued PDF
-- =====================================================================
-- WHY (follows 20261114130000_invoice_lifecycle)
--   1. The portal lists every invoice that was sent. An invoice can now be
--      cancelled after it was sent (with a credit note) — but the portal
--      had no status to show, so a cancelled invoice still looked payable,
--      and its credit note looked like a second invoice.
--   2. The portal rebuilt the invoice PDF in the browser from the invoice
--      row. With rechargeable expenses the issued PDF also carries receipt
--      copies, which a portal user cannot (and should not) read from the
--      expense tables. The PDF frozen at issue is the right thing to serve.
--
-- WHAT
--   a. portal_list_invoices / portal_get_invoice additionally return
--      status, document_type, client_ref, vat_registered, paid_at and
--      (detail only) has_pdf + credits_invoice_number. Same access rule as
--      before: the caller's own client, sent invoices only.
--   b. A narrow storage read policy: a portal user may read an object in
--      invoice-pdfs only when it is the stored PDF of a sent invoice
--      belonging to their own client. Decided by a SECURITY DEFINER helper
--      (portal_client_id() is deliberately not callable by clients).
--
-- No data is modified. Operators' access is unchanged.
-- =====================================================================

-- a ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_list_invoices()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid uuid := public.portal_client_id();
  v_org uuid;
BEGIN
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM public.clients WHERE id = v_cid;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', inv.id,
      'invoice_number', inv.invoice_number,
      'issue_date', inv.issue_date,
      'due_date', inv.due_date,
      'subtotal', inv.subtotal,
      'vat_amount', inv.vat_amount,
      'total', inv.total,
      'sent_at', inv.sent_at,
      'status', inv.status,
      'document_type', inv.document_type,
      'paid_at', inv.paid_at
    ) ORDER BY inv.issue_date DESC, inv.created_at DESC)
    FROM public.invoices inv
    WHERE inv.client_id = v_cid
      AND inv.org_id = v_org
      AND inv.sent_at IS NOT NULL
  ), '[]'::jsonb);
END;
$function$;

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
      'company_number', o.company_number
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

REVOKE ALL ON FUNCTION public.portal_list_invoices() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_get_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_list_invoices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_invoice(uuid) TO authenticated;

-- b ─────────────────────────────────────────────────────────────────────
-- True only for the stored PDF of a SENT invoice of the caller's own client.
CREATE OR REPLACE FUNCTION public.portal_can_read_invoice_pdf(p_object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_object_name IS NOT NULL
     AND public.portal_client_id() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.invoices i
       JOIN public.clients c ON c.id = i.client_id
       WHERE i.pdf_url = p_object_name
         AND i.client_id = public.portal_client_id()
         AND i.org_id = c.org_id
         AND i.sent_at IS NOT NULL
     )
$function$;

REVOKE ALL ON FUNCTION public.portal_can_read_invoice_pdf(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_can_read_invoice_pdf(text) TO authenticated;

DROP POLICY IF EXISTS "invoice_pdfs_select_portal_client" ON storage.objects;
CREATE POLICY "invoice_pdfs_select_portal_client"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoice-pdfs'
  AND public.portal_can_read_invoice_pdf(storage.objects.name)
);
