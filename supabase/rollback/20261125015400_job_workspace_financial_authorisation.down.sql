-- Emergency containment only: do not restore silent issued cancellation.
-- Coordinated frontend rollback; existing financial documents are untouched.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.cancel_invoice_authorised(uuid,text,boolean,text,numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.correct_invoiced_job_abort_fee_authorised(uuid,uuid,numeric,numeric,text,boolean,boolean,boolean,boolean,text,numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_invoice(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.correct_invoiced_job_abort_fee(uuid,uuid,numeric,numeric,text,boolean,boolean,boolean) FROM PUBLIC, anon, authenticated;
COMMIT;
-- Reapply the forward migration after remediation to re-enable authorised actions.
