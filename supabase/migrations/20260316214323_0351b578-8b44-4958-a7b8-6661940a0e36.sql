-- Remove hardcoded emails from is_super_admin() — now purely role-based
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    lower(coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    )) IN ('super_admin', 'superadmin')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb)
      ) AS r(role)
      WHERE upper(r.role) IN ('SUPERADMIN', 'SUPER_ADMIN')
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        coalesce(auth.jwt() -> 'user_metadata' -> 'roles', '[]'::jsonb)
      ) AS r(role)
      WHERE upper(r.role) IN ('SUPERADMIN', 'SUPER_ADMIN')
    );
$$;