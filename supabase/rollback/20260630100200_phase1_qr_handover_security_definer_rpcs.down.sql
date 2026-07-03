-- =====================================================================
-- ROLLBACK for 20260630100200_phase1_qr_handover_security_definer_rpcs
-- =====================================================================
-- Drops the handover RPCs. NOTE: this does NOT recreate any anon table policy,
-- because the pre-migration state had none in the migration history (the flow
-- relied on a since-dropped USING(true) policy). If you must restore the old
-- direct-anon behaviour, do so explicitly and deliberately — it re-opens
-- read/write of ALL handover confirmations to anon.
-- =====================================================================

DROP FUNCTION IF EXISTS public.qr_confirm(text, text, text);
DROP FUNCTION IF EXISTS public.qr_lookup(text);
