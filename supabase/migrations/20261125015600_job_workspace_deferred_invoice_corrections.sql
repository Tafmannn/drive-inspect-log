-- Deferred review is a non-financial record only. Never creates a credit or changes fees.
BEGIN;
CREATE TABLE IF NOT EXISTS public.invoice_correction_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.organisations(id),
 invoice_id uuid NOT NULL REFERENCES public.invoices(id),
 invoice_number text NOT NULL,
 abort_id uuid REFERENCES public.job_aborts(id),
 job_id uuid REFERENCES public.jobs(id),
 reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
 revised_fee numeric,
 expected_fee numeric,
 requested_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','closed','withdrawn')),
 closed_at timestamptz,
 closed_by uuid,
 CHECK ((abort_id IS NULL AND job_id IS NULL AND revised_fee IS NULL AND expected_fee IS NULL)
     OR (abort_id IS NOT NULL AND job_id IS NOT NULL AND revised_fee IS NOT NULL AND expected_fee IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_correction_one_pending ON public.invoice_correction_requests(invoice_id) WHERE status='pending';
ALTER TABLE public.invoice_correction_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_correction_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invoice_correction_requests TO authenticated;
DROP POLICY IF EXISTS invoice_corrections_admin_read ON public.invoice_correction_requests;
CREATE POLICY invoice_corrections_admin_read ON public.invoice_correction_requests FOR SELECT TO authenticated
 USING(public.is_admin_or_super_admin() AND (org_id=public.user_org_id() OR public.is_super_admin()));

CREATE OR REPLACE FUNCTION public.defer_invoice_correction(p_invoice_id uuid,p_reason text,
 p_abort_id uuid DEFAULT NULL,p_revised_fee numeric DEFAULT NULL,p_expected_fee numeric DEFAULT NULL,
 p_client_confirmed boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
 v_inv public.invoices%ROWTYPE;
 v_abort public.job_aborts%ROWTYPE;
 v_id uuid;
 v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_or_super_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF char_length(v_reason) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED' USING ERRCODE='23514'; END IF;
 IF p_abort_id IS NOT NULL THEN
   IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'SUPER_ADMIN_ONLY' USING ERRCODE='42501'; END IF;
   SELECT * INTO v_abort FROM public.job_aborts WHERE id=p_abort_id FOR UPDATE;
   IF v_abort.id IS NULL OR v_abort.org_id IS DISTINCT FROM public.user_org_id()
      OR v_abort.finance_status IS DISTINCT FROM 'approved' OR v_abort.reopened_at IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.jobs WHERE id=v_abort.job_id AND status='aborted')
   THEN RAISE EXCEPTION 'ABORT_NOT_CURRENT' USING ERRCODE='23514'; END IF;
   IF p_client_confirmed IS DISTINCT FROM true OR char_length(v_reason)<15
      OR p_revised_fee IS NULL OR p_revised_fee::text IN ('NaN','Infinity','-Infinity')
      OR p_revised_fee<0 OR p_revised_fee<>round(p_revised_fee,2) OR p_revised_fee= v_abort.approved_amount
      OR p_expected_fee IS NULL OR p_expected_fee IS DISTINCT FROM v_abort.approved_amount
   THEN RAISE EXCEPTION 'CORRECTION_DETAILS_INVALID' USING ERRCODE='23514'; END IF;
 ELSIF p_revised_fee IS NOT NULL OR p_expected_fee IS NOT NULL THEN
   RAISE EXCEPTION 'CORRECTION_DETAILS_INVALID' USING ERRCODE='23514';
 END IF;
 SELECT * INTO v_inv FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF v_inv.id IS NULL OR v_inv.is_test OR (NOT public.is_super_admin() AND v_inv.org_id IS DISTINCT FROM public.user_org_id())
    OR v_inv.document_type IS DISTINCT FROM 'invoice' OR v_inv.status NOT IN ('sent','paid')
 THEN RAISE EXCEPTION 'ISSUED_INVOICE_NOT_FOUND' USING ERRCODE='23514'; END IF;
 IF p_abort_id IS NOT NULL AND (v_abort.org_id IS DISTINCT FROM v_inv.org_id OR NOT (
      v_inv.job_id IS NOT DISTINCT FROM v_abort.job_id OR EXISTS (
      SELECT 1 FROM public.invoice_items WHERE invoice_id=v_inv.id AND job_id=v_abort.job_id AND NOT coalesce(voided,false))))
 THEN RAISE EXCEPTION 'ABORT_INVOICE_NOT_FOUND' USING ERRCODE='23514'; END IF;
 SELECT id INTO v_id FROM public.invoice_correction_requests
 WHERE invoice_id=v_inv.id AND status='pending' AND abort_id IS NOT DISTINCT FROM p_abort_id
 AND reason=v_reason AND revised_fee IS NOT DISTINCT FROM p_revised_fee AND expected_fee IS NOT DISTINCT FROM p_expected_fee;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 IF EXISTS (SELECT 1 FROM public.invoice_correction_requests WHERE invoice_id=v_inv.id AND status='pending')
 THEN RAISE EXCEPTION 'CORRECTION_ALREADY_PENDING' USING ERRCODE='23514'; END IF;
 INSERT INTO public.invoice_correction_requests(org_id,invoice_id,invoice_number,abort_id,job_id,reason,revised_fee,expected_fee,requested_by)
 VALUES(v_inv.org_id,v_inv.id,v_inv.invoice_number,p_abort_id,v_abort.job_id,v_reason,p_revised_fee,p_expected_fee,auth.uid())
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_invoice_correction(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_or_super_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 UPDATE public.invoice_correction_requests SET status='withdrawn',closed_at=now(),closed_by=auth.uid()
 WHERE id=p_request_id AND status='pending'
 AND (org_id=public.user_org_id() OR public.is_super_admin()) AND (abort_id IS NULL OR public.is_super_admin());
 IF NOT FOUND THEN RAISE EXCEPTION 'CORRECTION_NOT_FOUND' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.close_invoice_correction_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
   UPDATE public.invoice_correction_requests SET status='closed',closed_at=now(),closed_by=auth.uid()
   WHERE org_id=NEW.org_id AND invoice_id=NEW.id AND status='pending' AND abort_id IS NULL;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_close_invoice_correction_requests ON public.invoices;
CREATE TRIGGER trg_close_invoice_correction_requests AFTER UPDATE OF status ON public.invoices
 FOR EACH ROW EXECUTE FUNCTION public.close_invoice_correction_requests();
-- Abort requests close only after the actual fee correction is recorded,
-- not when an unrelated cancellation reverses the original invoice.
CREATE OR REPLACE FUNCTION public.close_abort_correction_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
 UPDATE public.invoice_correction_requests SET status='closed',closed_at=now(),closed_by=auth.uid()
 WHERE org_id=NEW.org_id AND invoice_id=NEW.original_invoice_id AND abort_id=NEW.abort_id AND status='pending';
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_close_abort_correction_requests ON public.job_abort_invoice_corrections;
CREATE TRIGGER trg_close_abort_correction_requests AFTER INSERT ON public.job_abort_invoice_corrections
 FOR EACH ROW EXECUTE FUNCTION public.close_abort_correction_requests();
REVOKE ALL ON FUNCTION public.close_abort_correction_requests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_invoice_correction(uuid,text,uuid,numeric,numeric,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_invoice_correction(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_invoice_correction_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.defer_invoice_correction(uuid,text,uuid,numeric,numeric,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_invoice_correction(uuid) TO authenticated;
COMMIT;
