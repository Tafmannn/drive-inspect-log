-- Rollback for 20261116212409_active_only_admin_helpers.sql (PR #108).
-- Restores the previous helper bodies, as described in that migration's
-- header: drop the "account_status = 'active'" predicate from
-- is_admin_or_super_admin() and is_super_admin(), and drop the super_admin
-- short-circuit from user_has_permission(). Same signatures, SECURITY
-- settings and search_path, so existing grants and policies are unaffected.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('admin', 'super_admin')
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    WHERE up.auth_user_id = auth.uid()
      AND up.role = 'super_admin'
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  with profile as (
    select up.auth_user_id, up.role, up.account_status
    from public.user_profiles up
    where up.auth_user_id = p_user_id
    limit 1
  ),
  denial as (
    select 1
    from public.user_permission_overrides uo
    where uo.user_id = p_user_id
      and uo.permission_key = p_permission_key
      and uo.grant_type = 'deny'
    limit 1
  ),
  allowance as (
    select 1
    from public.user_permission_overrides uo
    where uo.user_id = p_user_id
      and uo.permission_key = p_permission_key
      and uo.grant_type = 'allow'
    limit 1
  ),
  template as (
    select rpt.is_allowed
    from profile p
    join public.role_permission_templates rpt
      on rpt.role = p.role
     and rpt.permission_key = p_permission_key
    limit 1
  )
  select case
    when not exists (select 1 from profile) then false
    when (select account_status from profile) <> 'active' then false
    when exists (select 1 from denial) then false
    when exists (select 1 from allowance) then true
    when exists (select 1 from template where is_allowed = true) then true
    else false
  end;
$function$;

COMMIT;
