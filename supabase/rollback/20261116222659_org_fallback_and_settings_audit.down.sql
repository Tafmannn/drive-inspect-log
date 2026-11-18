-- Rollback for 20261116222659_org_fallback_and_settings_audit.sql (PR #112).
-- 1) Restores user_org_id() to its previous body: a profile with no org falls
--    back to the OLDEST organisation for a super admin (the behaviour the
--    migration removed). Same signature, SECURITY and search_path, so every
--    policy that calls it is unaffected.
-- 2) Removes the app_settings audit trigger and its function.
-- Both steps are safe to re-run.
BEGIN;

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT up.org_id FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() LIMIT 1),
    CASE
      WHEN public.is_super_admin()
        THEN (SELECT id FROM public.organisations ORDER BY created_at ASC LIMIT 1)
      ELSE NULL
    END
  );
$function$;

DROP TRIGGER IF EXISTS trg_app_settings_audit ON public.app_settings;
DROP FUNCTION IF EXISTS public.audit_app_settings_change();

COMMIT;
