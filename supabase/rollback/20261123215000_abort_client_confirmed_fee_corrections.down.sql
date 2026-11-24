-- Rollback for 20261123215000_abort_client_confirmed_fee_corrections.sql.
-- STOP if ANY new client confirmation, over-price fee or credit-note correction
-- is present. Never silently reverse client-agreed financial decisions.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.job_abort_invoice_corrections)
    OR EXISTS (SELECT 1 FROM public.job_aborts
       WHERE client_fee_confirmed_at IS NOT NULL
          OR (agreed_price IS NOT NULL AND approved_amount>agreed_price)) THEN
    RAISE EXCEPTION 'ROLLBACK_REFUSED_ABORT_FINANCIAL_HISTORY'
      USING ERRCODE='23514';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_corrected_abort_invoice_item ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_link_corrected_abort_legacy_invoice ON public.invoices;
DROP FUNCTION IF EXISTS public.link_corrected_abort_invoice();
DROP FUNCTION IF EXISTS public.correct_invoiced_job_abort_fee(uuid,uuid,numeric,numeric,text,boolean,boolean,boolean);
DROP TABLE IF EXISTS public.job_abort_invoice_corrections;

ALTER TABLE public.job_abort_events DROP CONSTRAINT IF EXISTS job_abort_events_action_check;
ALTER TABLE public.job_abort_events ADD CONSTRAINT job_abort_events_action_check CHECK (
  action IN ('requested','request_dismissed','confirmed','claim_approved',
             'claim_rejected','claim_amended','reopened','customer_notified','replacement_created'));

DROP FUNCTION IF EXISTS public.review_job_abort_claim(uuid,text,numeric,text,boolean);
CREATE OR REPLACE FUNCTION public.review_job_abort_claim(
  p_abort_id uuid,
  p_decision text,
  p_amount   numeric DEFAULT NULL,
  p_note     text DEFAULT NULL
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
    v_amount := COALESCE(p_amount, v_abort.proposed_amount);
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'AMOUNT_REQUIRED'
        USING ERRCODE = '23514', HINT = 'The agreed price is unknown, so enter the approved amount';
    END IF;
    v_amount := round(v_amount, 2);
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
    END IF;
    IF v_abort.agreed_price IS NOT NULL AND v_amount > v_abort.agreed_price THEN
      RAISE EXCEPTION 'AMOUNT_ABOVE_AGREED_PRICE'
        USING ERRCODE = '23514', HINT = 'The approved amount cannot exceed the agreed price';
    END IF;
  ELSE
    v_amount := NULL;
  END IF;

  UPDATE public.job_aborts
     SET finance_status = p_decision, approved_amount = v_amount,
         reviewed_by = v_uid, reviewed_at = now(), review_note = v_note
   WHERE id = p_abort_id
   RETURNING * INTO v_abort;

  INSERT INTO public.job_abort_events (org_id, job_id, abort_id, actor_id, action, finance_status, amount, note)
  VALUES (v_abort.org_id, v_abort.job_id, v_abort.id, v_uid,
          CASE WHEN p_decision = 'approved' THEN 'claim_approved' ELSE 'claim_rejected' END,
          p_decision, v_amount, v_note);

  RETURN jsonb_build_object('abortId', v_abort.id, 'financeStatus', v_abort.finance_status,
                            'approvedAmount', v_abort.approved_amount, 'reviewedAt', v_abort.reviewed_at);
END;
$function$;
REVOKE ALL ON FUNCTION public.review_job_abort_claim(uuid,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_job_abort_claim(uuid,text,numeric,text) TO authenticated;

DROP FUNCTION IF EXISTS public.amend_approved_job_abort_claim(uuid,numeric,text,numeric,boolean);
CREATE OR REPLACE FUNCTION public.amend_approved_job_abort_claim(
  p_abort_id uuid,
  p_new_amount numeric,
  p_reason text,
  p_expected_amount numeric
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
  IF v_abort.agreed_price IS NOT NULL AND v_new_amount > v_abort.agreed_price THEN
    RAISE EXCEPTION 'AMOUNT_ABOVE_AGREED_PRICE' USING ERRCODE = '23514';
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
         last_amendment_reason = v_reason
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
     format('Previous approved fee: £%s; amended to: £%s; reason: %s',
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
REVOKE ALL ON FUNCTION public.amend_approved_job_abort_claim(uuid,numeric,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.amend_approved_job_abort_claim(uuid,numeric,text,numeric) TO authenticated;

ALTER TABLE public.job_aborts
  ADD CONSTRAINT job_aborts_approved_within_agreed CHECK (
    approved_amount IS NULL OR agreed_price IS NULL OR approved_amount <= agreed_price
  );
ALTER TABLE public.job_aborts
  DROP COLUMN IF EXISTS client_fee_confirmed_at,
  DROP COLUMN IF EXISTS client_fee_confirmed_by,
  DROP COLUMN IF EXISTS client_fee_confirmed_amount;
COMMIT;
