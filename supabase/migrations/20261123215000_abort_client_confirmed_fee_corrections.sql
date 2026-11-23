-- Axentra: client-confirmed Abort fee approvals, above-original-price support,
-- and atomic full-credit/corrected fee workflow. Existing approvals untouched.
-- ALTERations additive apart from removing the previously agreed-price-only
-- business constraint; original job_pricing never changes.
ALTER TABLE public.job_aborts
  ADD COLUMN IF NOT EXISTS client_fee_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS client_fee_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS client_fee_confirmed_amount numeric;
ALTER TABLE public.job_aborts
  DROP CONSTRAINT IF EXISTS job_aborts_approved_within_agreed;

-- Replace the old 4-argument API; failing closed for stale client versions.
-- Old approved records are grandfathered, not falsely marked client-confirmed.
DROP FUNCTION IF EXISTS public.review_job_abort_claim(uuid,text,numeric,text);
CREATE OR REPLACE FUNCTION public.review_job_abort_claim(
  p_abort_id uuid,
  p_decision text,
  p_amount   numeric DEFAULT NULL,
  p_note     text DEFAULT NULL,
  p_client_confirmed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_abort  public.job_aborts%ROWTYPE;
  v_amount numeric;
  v_note   text := left(NULLIF(btrim(COALESCE(p_note, '')), ''), 500);
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_abort FROM public.job_aborts WHERE id = p_abort_id FOR UPDATE;
  IF v_abort.id IS NULL OR NOT (public.is_super_admin() OR v_abort.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'ABORT_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_abort.reopened_at IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT_REOPENED'
      USING ERRCODE = '23514', HINT = 'The job was reopened, so this Abort can no longer be claimed';
  END IF;

  -- Serialise with the invoicing guard, then refuse to change a claim that is billed.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || v_abort.job_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.invoice_items ii
              WHERE ii.job_id = v_abort.job_id AND NOT COALESCE(ii.voided, false))
     OR EXISTS (SELECT 1 FROM public.invoices i
                 WHERE i.job_id = v_abort.job_id AND i.status <> 'cancelled'
                   AND COALESCE(i.document_type, 'invoice') = 'invoice') THEN
    RAISE EXCEPTION 'ABORT_CLAIM_INVOICED'
      USING ERRCODE = '23514', HINT = 'Cancel the invoice before changing this Abort fee';
  END IF;

  -- Finance review is final. Repeated Approve/Reject calls must never rewrite
  -- the first approver, reviewed_at, approved_amount or audit history.
  -- Explicit super-admin corrections use amend_approved_job_abort_claim().
  IF v_abort.finance_status <> 'pending_review' THEN
    RAISE EXCEPTION 'ABORT_CLAIM_ALREADY_REVIEWED'
      USING ERRCODE = '23514',
            HINT = 'This fee decision is final. A super admin must use the audited amendment action';
  END IF;
  IF p_decision = 'approved' THEN
    IF p_client_confirmed IS NOT TRUE THEN
      RAISE EXCEPTION 'CLIENT_FEE_CONFIRMATION_REQUIRED' USING ERRCODE = '23514';
    END IF;
    v_amount := COALESCE(p_amount, v_abort.proposed_amount);
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'AMOUNT_REQUIRED'
        USING ERRCODE = '23514', HINT = 'The agreed price is unknown, so enter the approved amount';
    END IF;
    v_amount := round(v_amount, 2);
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
    END IF;
  ELSE
    v_amount := NULL;
  END IF;

  UPDATE public.job_aborts
     SET finance_status = p_decision, approved_amount = v_amount,
         reviewed_by = v_uid, reviewed_at = now(), review_note = v_note,
         client_fee_confirmed_by = CASE WHEN p_decision = 'approved' THEN v_uid ELSE NULL END,
         client_fee_confirmed_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
         client_fee_confirmed_amount = CASE WHEN p_decision = 'approved' THEN v_amount ELSE NULL END
   WHERE id = p_abort_id
   RETURNING * INTO v_abort;

  INSERT INTO public.job_abort_events (org_id, job_id, abort_id, actor_id, action, finance_status, amount, note)
  VALUES (v_abort.org_id, v_abort.job_id, v_abort.id, v_uid,
          CASE WHEN p_decision = 'approved' THEN 'claim_approved' ELSE 'claim_rejected' END,
          p_decision, v_amount,
          CASE WHEN p_decision = 'approved' THEN
            concat('Admin attests client confirmed £', v_amount::text, '; ', COALESCE(v_note, ''))
            ELSE v_note END);

  RETURN jsonb_build_object('abortId', v_abort.id, 'financeStatus', v_abort.finance_status,
                            'approvedAmount', v_abort.approved_amount, 'reviewedAt', v_abort.reviewed_at,
                            'clientConfirmedAt', v_abort.client_fee_confirmed_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.review_job_abort_claim(uuid,text,numeric,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_job_abort_claim(uuid,text,numeric,text,boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.amend_approved_job_abort_claim(uuid,numeric,text,numeric);
CREATE OR REPLACE FUNCTION public.amend_approved_job_abort_claim(
  p_abort_id uuid,
  p_new_amount numeric,
  p_reason text,
  p_expected_amount numeric,
  p_client_confirmed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_abort public.job_aborts%ROWTYPE;
  v_old_amount numeric;
  v_new_amount numeric;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF p_client_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'CLIENT_FEE_CONFIRMATION_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF length(v_reason) < 15 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'AMENDMENT_REASON_REQUIRED'
      USING ERRCODE = '23514',
            HINT = 'Explain the exceptional correction in 15 to 500 characters';
  END IF;

  SELECT * INTO v_abort FROM public.job_aborts
   WHERE id = p_abort_id FOR UPDATE;
  -- Even a super admin may not amend another organisation's financial records.
  IF v_abort.id IS NULL OR v_abort.org_id IS DISTINCT FROM public.user_org_id() THEN
    RAISE EXCEPTION 'ABORT_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_abort.finance_status <> 'approved' OR v_abort.approved_amount IS NULL THEN
    RAISE EXCEPTION 'ABORT_FEE_NOT_APPROVED' USING ERRCODE = '23514';
  END IF;
  IF v_abort.reopened_at IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public.jobs j
                     WHERE j.id = v_abort.job_id AND j.status = 'aborted') THEN
    RAISE EXCEPTION 'ABORT_NOT_CURRENT' USING ERRCODE = '23514';
  END IF;

  v_old_amount := v_abort.approved_amount;
  IF p_expected_amount IS NULL OR v_old_amount IS DISTINCT FROM p_expected_amount THEN
    RAISE EXCEPTION 'ABORT_FEE_CHANGED'
      USING ERRCODE = '23514', HINT = 'The approved fee changed. Reload before amending';
  END IF;
  IF p_new_amount IS NULL OR p_new_amount <> round(p_new_amount, 2) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT'
      USING ERRCODE = '23514', HINT = 'Enter an exact amount in pounds and pence';
  END IF;

  v_new_amount := p_new_amount;
  IF v_new_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
  END IF;
  IF v_new_amount = v_old_amount THEN
    RAISE EXCEPTION 'ABORT_AMENDMENT_NO_CHANGE'
      USING ERRCODE = '23514', HINT = 'Enter a different amount';
  END IF;

  -- Retain the original reviewed_by/reviewed_at/review_note. Correction identity
  -- is separately persisted and the immutable event logs old and new values.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || v_abort.job_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.invoice_items ii
              WHERE ii.job_id = v_abort.job_id AND NOT COALESCE(ii.voided, false))
     OR EXISTS (SELECT 1 FROM public.invoices i
                 WHERE i.job_id = v_abort.job_id AND i.status <> 'cancelled'
                   AND COALESCE(i.document_type, 'invoice') = 'invoice') THEN
    RAISE EXCEPTION 'ABORT_CLAIM_INVOICED'
      USING ERRCODE = '23514',
            HINT = 'An invoiced fee must be corrected using the invoice/credit-note process';
  END IF;

  UPDATE public.job_aborts
     SET approved_amount = v_new_amount,
         last_amended_at = now(),
         last_amended_by = v_uid,
         last_amendment_reason = v_reason,
         client_fee_confirmed_by = v_uid,
         client_fee_confirmed_at = now(),
         client_fee_confirmed_amount = v_new_amount
   WHERE id = p_abort_id
     AND finance_status = 'approved'
     AND approved_amount = v_old_amount
   RETURNING * INTO v_abort;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT_FEE_CHANGED' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.job_abort_events
    (org_id, job_id, abort_id, actor_id, action, finance_status, amount, note)
  VALUES
    (v_abort.org_id, v_abort.job_id, v_abort.id, v_uid,
     'claim_amended', 'approved', v_new_amount,
     format('Admin re-attested client fee confirmation. Previous approved fee: £%s; amended to: £%s; reason: %s',
            v_old_amount, v_new_amount, v_reason));

  RETURN jsonb_build_object(
    'abortId', v_abort.id, 'financeStatus', 'approved',
    'approvedAmount', v_new_amount,
    'previousAmount', v_old_amount,
    'amendedAt', v_abort.last_amended_at,
    'amendmentReason', v_reason
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.amend_approved_job_abort_claim(uuid,numeric,text,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_approved_job_abort_claim(uuid,numeric,text,numeric,boolean) TO authenticated;

-- Every correction is an append-only financial link:
-- original issued invoice -> full credit note -> replacement invoice.
CREATE TABLE IF NOT EXISTS public.job_abort_invoice_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  job_id uuid NOT NULL REFERENCES public.jobs(id),
  abort_id uuid NOT NULL REFERENCES public.job_aborts(id),
  original_invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  credit_note_id uuid REFERENCES public.invoices(id),
  replacement_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  original_invoice_number text NOT NULL,
  previous_fee numeric NOT NULL,
  revised_fee numeric NOT NULL,
  other_jobs_on_invoice integer NOT NULL DEFAULT 0,
  original_was_paid boolean NOT NULL DEFAULT false,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 15 AND 500),
  client_confirmed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (abort_id, original_invoice_id)
);
CREATE INDEX IF NOT EXISTS job_abort_invoice_corrections_job_idx
  ON public.job_abort_invoice_corrections (job_id, created_at DESC);
ALTER TABLE public.job_abort_invoice_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_abort_invoice_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.job_abort_invoice_corrections TO authenticated;
CREATE POLICY abort_invoice_corrections_admin_read
  ON public.job_abort_invoice_corrections FOR SELECT TO authenticated
  USING (public.is_admin_or_super_admin() AND org_id = public.user_org_id());

ALTER TABLE public.job_abort_events DROP CONSTRAINT IF EXISTS job_abort_events_action_check;
ALTER TABLE public.job_abort_events ADD CONSTRAINT job_abort_events_action_check
  CHECK (action IN ('requested','request_dismissed','confirmed',
    'claim_approved','claim_rejected','claim_amended','invoice_fee_corrected',
    'reopened','customer_notified','replacement_created'));

-- Atomic: validate all parties and money, cancel the original invoice (the
-- existing cancel_invoice raises a full credit note), then amend the fee.
-- Any failure rolls back the cancellation and amendment together.
CREATE OR REPLACE FUNCTION public.correct_invoiced_job_abort_fee(
  p_abort_id uuid,
  p_original_invoice_id uuid,
  p_new_amount numeric,
  p_expected_amount numeric,
  p_reason text,
  p_client_confirmed boolean,
  p_multi_job_acknowledged boolean DEFAULT false,
  p_paid_acknowledged boolean DEFAULT false
)
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
  v_credit_id := public.cancel_invoice(v_invoice.id, v_reason);
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
REVOKE ALL ON FUNCTION public.correct_invoiced_job_abort_fee(uuid,uuid,numeric,numeric,text,boolean,boolean,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_invoiced_job_abort_fee(uuid,uuid,numeric,numeric,text,boolean,boolean,boolean)
  TO authenticated;

-- Link the replacement job invoice to its correction record on whichever
-- existing invoicing path is used (multi-job invoice_items or legacy invoice).
CREATE OR REPLACE FUNCTION public.link_corrected_abort_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job uuid;
  v_invoice uuid;
  v_org uuid;
BEGIN
  IF TG_TABLE_NAME='invoice_items' THEN
    IF NEW.job_id IS NULL OR COALESCE(NEW.voided,false) THEN RETURN NEW; END IF;
    v_job:=NEW.job_id;
    v_invoice:=NEW.invoice_id;
  ELSE
    IF NEW.job_id IS NULL OR NEW.status='cancelled'
       OR COALESCE(NEW.document_type,'invoice')<>'invoice' THEN RETURN NEW; END IF;
    v_job:=NEW.job_id;
    v_invoice:=NEW.id;
  END IF;
  SELECT org_id INTO v_org FROM public.invoices
    WHERE id=v_invoice AND status<>'cancelled' AND document_type='invoice';
  IF v_org IS NULL THEN RETURN NEW; END IF;

  UPDATE public.job_abort_invoice_corrections c
    SET replacement_invoice_id=v_invoice
    WHERE c.id = (
      SELECT x.id FROM public.job_abort_invoice_corrections x
      WHERE x.job_id=v_job AND x.org_id=v_org
        AND (x.replacement_invoice_id IS NULL
          OR EXISTS (SELECT 1 FROM public.invoices prev
            WHERE prev.id=x.replacement_invoice_id AND prev.status='cancelled'))
        AND EXISTS (SELECT 1 FROM public.invoices original
          WHERE original.id=x.original_invoice_id AND original.status='cancelled')
        AND x.original_invoice_id<>v_invoice
      ORDER BY x.created_at DESC LIMIT 1
    );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.link_corrected_abort_invoice() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_link_corrected_abort_invoice_item ON public.invoice_items;
CREATE TRIGGER trg_link_corrected_abort_invoice_item
AFTER INSERT ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.link_corrected_abort_invoice();
DROP TRIGGER IF EXISTS trg_link_corrected_abort_legacy_invoice ON public.invoices;
CREATE TRIGGER trg_link_corrected_abort_legacy_invoice
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.link_corrected_abort_invoice();
