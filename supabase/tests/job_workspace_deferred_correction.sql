-- Requires the disposable invoice_lifecycle.test.sql fixtures. No persistent writes.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000aaaa',true);
-- New issued fixture: use existing org and avoid the already-cancelled originals.
INSERT INTO public.invoices(id,org_id,client_name,invoice_number,subtotal,total)
VALUES ('d5d00000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Synthetic client','DEFER-TEST',100,100);
UPDATE public.invoices SET status='sent',sent_at=now() WHERE id='d5d00000-0000-0000-0000-000000000001';
DO $$ DECLARE v_id uuid; BEGIN
 v_id:=public.defer_invoice_correction('d5d00000-0000-0000-0000-000000000001','Check reference');
 ASSERT v_id=public.defer_invoice_correction('d5d00000-0000-0000-0000-000000000001','Check reference'), 'idempotent defer';
 ASSERT (SELECT status='sent' AND total=100 FROM public.invoices WHERE id='d5d00000-0000-0000-0000-000000000001'), 'original remains payable';
 ASSERT (SELECT count(*)=0 FROM public.invoices WHERE credits_invoice_id='d5d00000-0000-0000-0000-000000000001'), 'no credit created';
 PERFORM public.withdraw_invoice_correction(v_id);
 ASSERT (SELECT status='withdrawn' FROM public.invoice_correction_requests WHERE id=v_id), 'request history retained';
END $$;
SELECT public.defer_invoice_correction('d5d00000-0000-0000-0000-000000000001','Check reference again');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000bbbb',true);
DO $$ BEGIN
 ASSERT (SELECT count(*)=0 FROM public.invoice_correction_requests WHERE invoice_id='d5d00000-0000-0000-0000-000000000001'), 'other org cannot see request';
 BEGIN
 PERFORM public.defer_invoice_correction('d5d00000-0000-0000-0000-000000000001','Other org');
 RAISE EXCEPTION 'cross-tenant defer unexpectedly succeeded';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000aaaa',true);
SELECT public.cancel_invoice_authorised('d5d00000-0000-0000-0000-000000000001','Explicit approval',true);
DO $$ BEGIN
 ASSERT (SELECT count(*)=0 FROM public.invoice_correction_requests WHERE invoice_id='d5d00000-0000-0000-0000-000000000001' AND status='pending'), 'explicit cancellation closes queue';
 ASSERT (SELECT count(*)=1 FROM public.invoices WHERE credits_invoice_id='d5d00000-0000-0000-0000-000000000001'), 'one explicitly authorised credit';
END $$;
RESET ROLE;
ROLLBACK;
