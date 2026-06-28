-- =====================================================================
-- Phase 1 / C4 (prerequisite): backfill user_profiles + signup trigger
-- =====================================================================
-- PURPOSE
--   Make `public.user_profiles` the single, complete source of truth for
--   every authenticated user, so that a later migration can safely REMOVE
--   the JWT `user_metadata` fallback from is_super_admin()/user_org_id()/
--   user_role() without locking anyone out.
--
-- SAFETY / SECURITY NOTES
--   * This migration is ADDITIVE and non-breaking on its own: it does NOT
--     change any RLS helper yet. Apply + verify this first; the deny-by-
--     default flip ships in a separate, later migration.
--   * role is derived ONLY from app_metadata (which is service-role-only and
--     cannot be self-set by a user). user_metadata.role is intentionally
--     ignored so that any pre-existing self-asserted "super_admin"/"admin" in
--     user_metadata is NOT laundered into a real profile row.
--   * org_id is derived from app_metadata first, then user_metadata, because
--     legacy drivers assigned via the old assign-driver function only have
--     their org in user_metadata. Review the audit query in the runbook
--     BEFORE applying the Stage 2 deny-by-default migration.
--   * account_status is set to 'active' for backfilled (already-provisioned)
--     users to avoid locking out working accounts. Genuinely suspended users
--     were banned at the auth layer and remain banned regardless.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) One-time backfill of existing auth.users without a profile row
-- ---------------------------------------------------------------------
INSERT INTO public.user_profiles (
  auth_user_id,
  email,
  first_name,
  last_name,
  display_name,
  role,
  org_id,
  account_status
)
SELECT
  au.id,
  coalesce(au.email, ''),
  nullif(au.raw_user_meta_data ->> 'first_name', ''),
  nullif(au.raw_user_meta_data ->> 'last_name', ''),
  coalesce(
    nullif(au.raw_user_meta_data ->> 'display_name', ''),
    nullif(au.raw_user_meta_data ->> 'full_name', ''),
    nullif(au.raw_user_meta_data ->> 'name', '')
  ),
  -- role: ONLY from app_metadata (service-controlled). Never user_metadata.
  CASE
    WHEN lower(coalesce(au.raw_app_meta_data ->> 'role', '')) IN ('super_admin', 'superadmin')
      THEN 'super_admin'
    WHEN lower(coalesce(au.raw_app_meta_data ->> 'role', '')) = 'admin'
      THEN 'admin'
    ELSE 'driver'
  END,
  -- org_id: app_metadata first, then user_metadata (legacy assign-driver),
  -- but only if it resolves to a real organisation.
  (
    SELECT o.id
    FROM public.organisations o
    WHERE o.id = COALESCE(
      nullif(au.raw_app_meta_data  ->> 'org_id', '')::uuid,
      nullif(au.raw_user_meta_data ->> 'org_id', '')::uuid
    )
    LIMIT 1
  ),
  'active'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles up WHERE up.auth_user_id = au.id
)
ON CONFLICT (auth_user_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) Signup trigger: create a profile row for every NEW auth user.
--    SECURITY: role/org come ONLY from app_metadata (service-set). A
--    self-signup that injects user_metadata.role = 'super_admin' gets a
--    plain 'driver' profile — no escalation possible.
--    Org-scoped invites set the real role/org via the edge function, which
--    upserts this row afterwards (ON CONFLICT below leaves it for that path).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    auth_user_id,
    email,
    first_name,
    last_name,
    display_name,
    role,
    org_id,
    account_status
  )
  VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    nullif(NEW.raw_user_meta_data ->> 'first_name', ''),
    nullif(NEW.raw_user_meta_data ->> 'last_name', ''),
    coalesce(
      nullif(NEW.raw_user_meta_data ->> 'display_name', ''),
      nullif(NEW.raw_user_meta_data ->> 'full_name', ''),
      nullif(NEW.raw_user_meta_data ->> 'name', '')
    ),
    -- role: app_metadata only; default driver.
    CASE
      WHEN lower(coalesce(NEW.raw_app_meta_data ->> 'role', '')) IN ('super_admin', 'superadmin')
        THEN 'super_admin'
      WHEN lower(coalesce(NEW.raw_app_meta_data ->> 'role', '')) = 'admin'
        THEN 'admin'
      ELSE 'driver'
    END,
    -- org_id: app_metadata only (service-set); NULL for self-signups.
    (
      SELECT o.id FROM public.organisations o
      WHERE o.id = nullif(NEW.raw_app_meta_data ->> 'org_id', '')::uuid
      LIMIT 1
    ),
    'pending_activation'
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
