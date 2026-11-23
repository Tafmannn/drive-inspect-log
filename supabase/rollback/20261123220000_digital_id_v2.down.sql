-- Axentra Digital ID V2 safe rollback.
-- IMPORTANT: keep credential tables, public serial assignments and event history.
-- This script disables credential issuing and authenticated read/write access.
-- Do NOT use DROP TABLE: permanent ID numbers and audit history must survive.
-- The frontend VITE_DIGITAL_ID_V2_ENABLED flag must also be turned off.
BEGIN;
DROP TRIGGER IF EXISTS digital_id_account_state_change ON public.user_profiles;
DROP TRIGGER IF EXISTS digital_id_driver_state_change ON public.driver_profiles;
REVOKE EXECUTE ON FUNCTION public.get_driver_digital_id(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_driver_digital_id_photo(uuid,text) FROM authenticated;
REVOKE SELECT ON public.driver_digital_credentials FROM authenticated;
REVOKE SELECT ON public.driver_digital_credential_events FROM authenticated;
-- Retain the guard_driver_digital_id_state trigger to prevent reopening
-- previously fixed self-activation vulnerabilities.
-- Retain the private storage bucket and RLS: deleting private media would
-- be destructive and prevent restoring credential history.
COMMIT;
