-- =====================================================================
-- Phase 1 / C4: deny-by-default RLS helper functions
-- =====================================================================
-- Removes the JWT `user_metadata` / `app_metadata` fallback from the three
-- security-boundary functions. After this migration, role and org are read
-- SOLELY from public.user_profiles (a server-controlled table). A user can no
-- longer escalate by self-writing `user_metadata` via auth.updateUser().
--
-- PREREQUISITE: 20260628100000 (backfill + signup trigger) MUST be applied and
-- verified first, otherwise users without a profile row would lose access.
--
-- Behaviour preserved intentionally:
--   * super-admins with a NULL org still resolve to the oldest organisation
--     (unchanged from the previous definition) so existing super-admin views
--     keep working.
-- =====================================================================

-- is_super_admin(): user_profiles ONLY. No JWT fallback.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.auth_user_id = auth.uid()
      AND up.role = 'super_admin'
  );
$$;

-- user_role(): user_profiles ONLY (defensive default 'driver' if somehow absent).
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT up.role FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() LIMIT 1),
    'driver'
  );
$$;

-- user_org_id(): user_profiles ONLY, with the pre-existing super-admin
-- default-org behaviour preserved. No JWT metadata fallback.
CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT up.org_id FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() LIMIT 1),
    CASE
      WHEN public.is_super_admin()
        THEN (SELECT id FROM public.organisations ORDER BY created_at ASC LIMIT 1)
      ELSE NULL
    END
  );
$$;
