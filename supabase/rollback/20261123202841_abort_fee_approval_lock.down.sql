-- Rollback for 20261123202841_abort_fee_approval_lock.sql
-- SAFETY: Refuse if ANY financial review or amendment exists: reverting the
-- one-time review guard would reopen an already decided fee to modification.
-- Production already has approved claims. Do NOT run this rollback there.
-- For a live correction after rollout, write a separate forward migration
-- that preserves the locked approval invariant and audit history.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.job_aborts
             WHERE finance_status <> 'pending_review'
                OR reviewed_at IS NOT NULL
                OR last_amended_at IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.job_abort_events
                WHERE action IN ('claim_approved','claim_rejected','claim_amended')) THEN
    RAISE EXCEPTION
      'ROLLBACK_REFUSED_REVIEWED_ABORT_FEES: do not remove the approval lock where decisions or corrections exist';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.amend_approved_job_abort_claim(uuid,numeric,text,numeric);

ALTER TABLE public.job_aborts
  DROP COLUMN IF EXISTS last_amended_at,
  DROP COLUMN IF EXISTS last_amended_by,
  DROP COLUMN IF EXISTS last_amendment_reason;

ALTER TABLE public.job_abort_events
  DROP CONSTRAINT IF EXISTS job_abort_events_action_check;
ALTER TABLE public.job_abort_events
  ADD CONSTRAINT job_abort_events_action_check CHECK (action IN (
    'requested', 'request_dismissed', 'confirmed', 'claim_approved',
    'claim_rejected', 'reopened', 'customer_notified', 'replacement_created'
  ));

-- Restore exactly the original RPC body from 20261123100000.
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

COMMIT;
