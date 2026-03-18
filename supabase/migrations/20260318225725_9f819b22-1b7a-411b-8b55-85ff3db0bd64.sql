-- Fix infinite recursion: all RLS helper functions must be SECURITY DEFINER
-- to bypass RLS when they query user_profiles from within RLS policies.

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role = 'super_admin'
  )
  or (
    not exists (select 1 from public.user_profiles where auth_user_id = auth.uid())
    and (
      lower(coalesce(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() -> 'user_metadata' ->> 'role',
        ''
      )) in ('super_admin', 'superadmin')
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('admin', 'super_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.user_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
  select coalesce(
    (select up.role from public.user_profiles up where up.auth_user_id = auth.uid() limit 1),
    case
      when lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) in ('super_admin','superadmin') then 'super_admin'
      when lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'admin' then 'admin'
      else coalesce(
        nullif(lower(auth.jwt() -> 'app_metadata' ->> 'role'), ''),
        nullif(lower(auth.jwt() -> 'user_metadata' ->> 'role'), ''),
        'driver'
      )
    end
  )
$$;

CREATE OR REPLACE FUNCTION public.user_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.user_account_status()
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path = public
AS $$
  select coalesce(
    (select account_status from public.user_profiles where auth_user_id = auth.uid()),
    'active'
  )
$$;