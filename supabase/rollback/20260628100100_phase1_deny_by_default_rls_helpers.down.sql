-- Rollback for 20260628100100_phase1_deny_by_default_rls_helpers
--
-- Restores the previous definitions (user_profiles-first, with JWT metadata
-- fallback) as defined in 20260317123952. Use only if the deny-by-default flip
-- causes unexpected access loss that cannot be fixed by correcting profile data.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles up
    WHERE up.auth_user_id = auth.uid() AND up.role = 'super_admin'
  )
  OR (
    NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE auth_user_id = auth.uid())
    AND (
      lower(coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        ''
      )) IN ('super_admin', 'superadmin')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT up.role FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() LIMIT 1),
    CASE
      WHEN lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) IN ('super_admin','superadmin') THEN 'super_admin'
      WHEN lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin' THEN 'admin'
      ELSE COALESCE(
        nullif(lower(auth.jwt() -> 'app_metadata' ->> 'role'), ''),
        nullif(lower(auth.jwt() -> 'user_metadata' ->> 'role'), ''),
        'driver'
      )
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT up.org_id FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() LIMIT 1),
    nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
    nullif(auth.jwt() -> 'user_metadata' ->> 'org_id', '')::uuid,
    CASE
      WHEN public.is_super_admin()
        THEN (SELECT id FROM public.organisations ORDER BY created_at ASC LIMIT 1)
      ELSE NULL
    END
  );
$$;
