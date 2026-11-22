-- Rollback of 20261121180000_silence_test_data.sql: test data becomes visible again.
-- Restores the six functions exactly as they were live on 2026-11-21 and drops the three policies.
BEGIN;

DROP POLICY IF EXISTS jobs_hide_test_data ON public.jobs;
DROP POLICY IF EXISTS invoices_hide_test_data ON public.invoices;
DROP POLICY IF EXISTS expenses_hide_test_data ON public.expenses;

CREATE OR REPLACE FUNCTION public.portal_list_jobs()
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
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_at DESC)
    FROM (
      SELECT
        j.id,
        COALESCE(NULLIF(j.external_job_number, ''), upper(left(j.id::text, 8))) AS job_ref,
        j.vehicle_reg, j.vehicle_make, j.vehicle_model, j.vehicle_colour,
        j.pickup_city, j.pickup_postcode,
        j.delivery_city, j.delivery_postcode,
        j.job_date, j.status, j.created_at, j.completed_at,
        COALESCE(j.completed_at, j.created_at) AS sort_at
      FROM public.jobs j
      WHERE j.client_id = v_cid
        AND j.org_id = v_org
        AND j.is_hidden = false
        AND j.status NOT IN ('draft', 'archived')
      ORDER BY sort_at DESC
      LIMIT 500
    ) t
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_get_job(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid uuid := public.portal_client_id();
  v_org uuid;
  v_job jsonb;
BEGIN
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM public.clients WHERE id = v_cid;

  SELECT jsonb_build_object(
    'id', j.id,
    'job_ref', COALESCE(NULLIF(j.external_job_number, ''), upper(left(j.id::text, 8))),
    'vehicle_reg', j.vehicle_reg,
    'vehicle_make', j.vehicle_make,
    'vehicle_model', j.vehicle_model,
    'vehicle_colour', j.vehicle_colour,
    'vehicle_year', j.vehicle_year,
    'pickup_address_line1', j.pickup_address_line1,
    'pickup_address_line2', j.pickup_address_line2,
    'pickup_city', j.pickup_city,
    'pickup_postcode', j.pickup_postcode,
    'pickup_contact_name', j.pickup_contact_name,
    'delivery_address_line1', j.delivery_address_line1,
    'delivery_address_line2', j.delivery_address_line2,
    'delivery_city', j.delivery_city,
    'delivery_postcode', j.delivery_postcode,
    'delivery_contact_name', j.delivery_contact_name,
    'job_date', j.job_date,
    'earliest_delivery_date', j.earliest_delivery_date,
    'status', j.status,
    'created_at', j.created_at,
    'completed_at', j.completed_at
  )
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.client_id = v_cid
    AND j.org_id = v_org
    AND j.is_hidden = false
    AND j.status NOT IN ('draft', 'archived');

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'job', v_job,
    'timeline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', l.to_status, 'at', l.created_at) ORDER BY l.created_at)
      FROM public.job_activity_log l
      WHERE l.job_id = p_job_id AND l.to_status IS NOT NULL
    ), '[]'::jsonb),
    'inspections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type', i.type,
        'inspected_at', i.inspected_at,
        'odometer', i.odometer,
        'fuel_level_percent', i.fuel_level_percent,
        'number_of_keys', i.number_of_keys,
        'customer_name', i.customer_name,
        'inspected_by_name', i.inspected_by_name,
        'notes', i.notes,
        'has_damage', i.has_damage,
        'damage', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'area', d.area, 'location', d.location, 'item', d.item,
            'damage_types', d.damage_types, 'notes', d.notes
          ) ORDER BY d.created_at)
          FROM public.damage_items d
          WHERE d.inspection_id = i.id AND d.archived_at IS NULL
        ), '[]'::jsonb)
      ) ORDER BY i.inspected_at NULLS LAST)
      FROM public.inspections i
      WHERE i.job_id = p_job_id AND i.archived_at IS NULL
    ), '[]'::jsonb)
  );
END;
$function$;

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

CREATE OR REPLACE FUNCTION public.qr_lookup(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v public.qr_confirmations%ROWTYPE;
  v_ref text;
  v_reg text;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v FROM public.qr_confirmations WHERE token = p_token LIMIT 1;
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'done');
  END IF;
  IF v.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  SELECT COALESCE(NULLIF(j.external_job_number, ''), left(v.job_id::text, 8)),
         j.vehicle_reg
    INTO v_ref, v_reg
    FROM public.jobs j WHERE j.id = v.job_id;

  RETURN jsonb_build_object(
    'status', 'ready',
    'event_type', v.event_type,
    'job_ref', v_ref,
    'vehicle_reg', v_reg
  );
END;
$function$;

COMMIT;
