-- Emergency containment: stop new requests and withdrawals; retain the queue,
-- history, tenant RLS and automatic close triggers for completed corrections.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.defer_invoice_correction(uuid,text,uuid,numeric,numeric,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.withdraw_invoice_correction(uuid) FROM PUBLIC, anon, authenticated;
COMMIT;
-- Reapply forward migration after remediation to restore the authorised RPCs.
