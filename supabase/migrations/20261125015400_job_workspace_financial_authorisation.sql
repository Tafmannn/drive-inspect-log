-- Job Workspace V2 Batch 01: explicit financial authorisation.
-- Do not apply until staging parity and backup/restore gates pass.
BEGIN;
CREATE OR REPLACE FUNCTION public.cancel_invoice_authorised(p_invoice_id uuid, p_reason text, p_authorise_credit boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
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

  IF v_inv.org_id IS DISTINCT FROM public.user_org_id() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.status <> 'draft' AND p_authorise_credit IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CREDIT_NOTE_AUTHORISATION_REQUIRED' USING ERRCODE = '23514';
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
CREATE OR REPLACE FUNCTION public.correct_invoiced_job_abort_fee_authorised(p_abort_id uuid, p_original_invoice_id uuid, p_new_amount numeric, p_expected_amount numeric, p_reason text, p_client_confirmed boolean, p_authorise_credit boolean, p_multi_job_acknowledged boolean DEFAULT false, p_paid_acknowledged boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_abort public.job_aborts%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_credit_id uuid;
  v_amended jsonb;
  v_correction_id uuid;
  v_other_jobs integer;
  v_reason text := btrim(COALESCE(p_reason,''));
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  IF p_client_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'CLIENT_FEE_CONFIRMATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF char_length(v_reason) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION 'AMENDMENT_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_abort FROM public.job_aborts WHERE id = p_abort_id FOR UPDATE;
  IF v_abort.id IS NULL OR v_abort.org_id IS DISTINCT FROM public.user_org_id() THEN
    RAISE EXCEPTION 'ABORT_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_abort.finance_status <> 'approved' OR v_abort.reopened_at IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public.jobs j
        WHERE j.id=v_abort.job_id AND j.status='aborted') THEN
    RAISE EXCEPTION 'ABORT_NOT_CURRENT' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || v_abort.job_id::text, 0));
  SELECT * INTO v_invoice FROM public.invoices
    WHERE id = p_original_invoice_id FOR UPDATE;
  IF v_invoice.id IS NULL OR v_invoice.org_id IS DISTINCT FROM v_abort.org_id
     OR COALESCE(v_invoice.document_type,'invoice') <> 'invoice'
     OR v_invoice.status = 'cancelled'
     OR NOT (v_invoice.job_id = v_abort.job_id
       OR EXISTS (SELECT 1 FROM public.invoice_items ii
          WHERE ii.invoice_id=v_invoice.id AND ii.job_id=v_abort.job_id
            AND NOT COALESCE(ii.voided,false))) THEN
    RAISE EXCEPTION 'ABORT_INVOICE_NOT_FOUND' USING ERRCODE = '23514';
  END IF;
  IF v_abort.approved_amount IS DISTINCT FROM p_expected_amount THEN
    RAISE EXCEPTION 'ABORT_FEE_CHANGED' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(DISTINCT ii.job_id) INTO v_other_jobs
    FROM public.invoice_items ii
    WHERE ii.invoice_id=v_invoice.id AND ii.job_id IS NOT NULL
      AND ii.job_id<>v_abort.job_id AND NOT COALESCE(ii.voided,false);
  IF v_other_jobs > 0 AND p_multi_job_acknowledged IS NOT TRUE THEN
    RAISE EXCEPTION 'FULL_CREDIT_OTHER_JOBS_ACK_REQUIRED'
      USING ERRCODE = '23514';
  END IF;
  IF v_invoice.status='paid' AND p_paid_acknowledged IS NOT TRUE THEN
    RAISE EXCEPTION 'PAID_INVOICE_REFUND_ACK_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  -- Existing invoice lifecycle guarantees the issued original is frozen,
  -- a FULL credit note is issued, and linked job lines are voided.
  IF v_invoice.status <> 'draft' AND p_authorise_credit IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CREDIT_NOTE_AUTHORISATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  v_credit_id := public.cancel_invoice_authorised(v_invoice.id, v_reason, p_authorise_credit);
  v_amended := public.amend_approved_job_abort_claim(
    v_abort.id,p_new_amount,v_reason,p_expected_amount,true);

  INSERT INTO public.job_abort_invoice_corrections
    (org_id,job_id,abort_id,original_invoice_id,credit_note_id,
     original_invoice_number,previous_fee,revised_fee,other_jobs_on_invoice,
     original_was_paid,reason,client_confirmed_by)
  VALUES
    (v_abort.org_id,v_abort.job_id,v_abort.id,v_invoice.id,v_credit_id,
     v_invoice.invoice_number,p_expected_amount,p_new_amount,v_other_jobs,
     v_invoice.status='paid',v_reason,v_uid)
  RETURNING id INTO v_correction_id;

  INSERT INTO public.job_abort_events
    (org_id,job_id,abort_id,actor_id,action,finance_status,amount,note)
  VALUES (v_abort.org_id,v_abort.job_id,v_abort.id,v_uid,'invoice_fee_corrected',
    'approved',p_new_amount,format(
      'Original invoice %s fully cancelled; credit note id %s; original fee £%s; revised £%s; %s',
      v_invoice.invoice_number,COALESCE(v_credit_id::text,'draft - none'),
      p_expected_amount,p_new_amount,v_reason));

  RETURN jsonb_build_object(
    'correctionId',v_correction_id,'creditNoteId',v_credit_id,
    'originalInvoiceNumber',v_invoice.invoice_number,
    'approvedAmount',p_new_amount,'otherJobsToReinvoice',v_other_jobs,
    'originalWasPaid',v_invoice.status='paid');
END;
$function$;
-- Legacy clients can still cancel drafts but cannot issue a credit note.
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path TO public AS $$
 SELECT public.cancel_invoice_authorised(p_invoice_id,p_reason,false);
$$;
CREATE OR REPLACE FUNCTION public.correct_invoiced_job_abort_fee(
 p_abort_id uuid,p_original_invoice_id uuid,p_new_amount numeric,p_expected_amount numeric,
 p_reason text,p_client_confirmed boolean,p_multi_job_acknowledged boolean DEFAULT false,
 p_paid_acknowledged boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO public AS $$
 SELECT public.correct_invoiced_job_abort_fee_authorised(p_abort_id,p_original_invoice_id,
 p_new_amount,p_expected_amount,p_reason,p_client_confirmed,false,p_multi_job_acknowledged,p_paid_acknowledged);
$$;
REVOKE ALL ON FUNCTION public.cancel_invoice_authorised(uuid,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_invoiced_job_abort_fee_authorised(uuid,uuid,numeric,numeric,text,boolean,boolean,boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_invoice(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_invoiced_job_abort_fee(uuid,uuid,numeric,numeric,text,boolean,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_authorised(uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_invoiced_job_abort_fee_authorised(uuid,uuid,numeric,numeric,text,boolean,boolean,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_invoiced_job_abort_fee(uuid,uuid,numeric,numeric,text,boolean,boolean,boolean) TO authenticated;
COMMIT;
