-- Close remaining access gaps found in the post-portal audit.
--
-- 1. organisations: anon could read every column of every org (legal name,
--    company/VAT numbers, addresses, contact name/email/phone, billing plan,
--    notes). Nothing reads organisations while signed out; signed-in users
--    keep "Users can read their organisation" and super admins keep
--    "Super admins can manage organisations". Portal branding comes from
--    portal_context(), not this table.
--
-- 2. app_settings: anon, and every signed-in user including customer-portal
--    logins, could read every setting, including pricing_defaults (the
--    pricing rules). On/off feature flags stay readable to everyone: the app
--    preloads them at startup, possibly before sign-in (src/lib/featureFlags.ts).
--    A row counts as a flag when its value is a JSON boolean or the string
--    "true"/"false". Every other setting is now staff-only (an org member or
--    a super admin). Writes are unchanged (super admins only).
--
-- 3. next_job_number(): any signed-in user, including portal logins, could
--    burn job numbers. Now staff-only. Its only caller is the admin job form
--    (src/lib/api.ts); no defaults, triggers or functions reference it.
--
-- 4. auto_link_job_to_client(): pin search_path (advisor:
--    function_search_path_mutable).

-- 1 ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read organisations" ON public.organisations;

-- 2 ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can read app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_select_all" ON public.app_settings;
DROP POLICY IF EXISTS "Authenticated users can read app_settings" ON public.app_settings;

CREATE POLICY "app_settings_read_feature_flags"
  ON public.app_settings
  FOR SELECT
  TO anon, authenticated
  USING (
    jsonb_typeof(value) = 'boolean'
    OR value IN ('"true"'::jsonb, '"false"'::jsonb)
  );

CREATE POLICY "app_settings_read_staff"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin() OR public.user_org_id() IS NOT NULL);

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_job_number()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_super_admin() OR public.user_org_id() IS NOT NULL) THEN
    RAISE EXCEPTION 'not authorised to allocate job numbers'
      USING ERRCODE = '42501';
  END IF;
  RETURN 'AX' || LPAD(nextval('public.job_number_seq')::text, 4, '0');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.next_job_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_job_number() TO authenticated;

-- 4 ─────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.auto_link_job_to_client() SET search_path = public;
