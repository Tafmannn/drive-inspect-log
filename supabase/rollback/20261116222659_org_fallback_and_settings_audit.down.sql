-- Rollback for 20261116222659_org_fallback_and_settings_audit.sql.
-- Restores the previous state described in that migration's header:
--  1) user_org_id() goes back to the body it had before this migration
--     (from 20260317123952): the profile's org, then the JWT org claims, then,
--     for a super admin with no org, the OLDEST organisation (finding F-08).
--     Same signature, SECURITY DEFINER and search_path, so existing grants and
--     policies that call it are unaffected.
--  2) The app_settings audit trigger and its function are removed. Rows already
--     written to admin_audit_log are left in place (audit history is kept).
-- Re-runnable: CREATE OR REPLACE and DROP ... IF EXISTS only.
BEGIN;

DROP TRIGGER IF EXISTS trg_app_settings_audit ON public.app_settings;
DROP FUNCTION IF EXISTS public.audit_app_settings_change();

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select coalesce(
    (select up.org_id from public.user_profiles up where up.auth_user_id = auth.uid() limit 1),
    nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
    nullif(auth.jwt() -> 'user_metadata' ->> 'org_id', '')::uuid,
    case
      when public.is_super_admin() then (
        select id from public.organisations order by created_at asc limit 1
      )
      else null
    end
  )
$function$;

COMMIT;
