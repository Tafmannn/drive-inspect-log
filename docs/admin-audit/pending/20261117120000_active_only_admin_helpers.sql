-- AWAITING APPROVAL — not applied. Move to supabase/migrations/ once approved.
--
-- 1) RLS role helpers become status-aware. is_admin_or_super_admin() and
--    is_super_admin() back 67 RLS policies but only looked at the role, so a
--    suspended (or not-yet-activated) admin keeps admin data access through
--    the REST API for as long as their access token is valid (suspension bans
--    the account, which stops refreshes, but an issued token lives up to ~1h).
--    The app's route guards and (after this change) every admin edge function
--    already refuse non-active accounts; this makes the database agree.
--
-- 2) user_has_permission(): the super admin holds every permission. Today
--    inheritance depends on role_permission_templates rows (verified complete
--    on 2026-11-16) and a deny override could still remove a permission from
--    the owner. Making it structural removes both failure modes.
--
-- Safe to re-run (CREATE OR REPLACE, same signatures, same SECURITY/search_path).
-- Rollback: re-create the previous bodies (see 03-findings.md, F-03).

create or replace function public.is_admin_or_super_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('admin', 'super_admin')
      and up.account_status = 'active'
  )
$function$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role = 'super_admin'
      and up.account_status = 'active'
  );
$function$;

create or replace function public.user_has_permission(p_user_id uuid, p_permission_key text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  with profile as (
    select up.auth_user_id, up.role, up.account_status
    from public.user_profiles up
    where up.auth_user_id = p_user_id
    limit 1
  ),
  denial as (
    select 1 from public.user_permission_overrides uo
    where uo.user_id = p_user_id and uo.permission_key = p_permission_key and uo.grant_type = 'deny'
    limit 1
  ),
  allowance as (
    select 1 from public.user_permission_overrides uo
    where uo.user_id = p_user_id and uo.permission_key = p_permission_key and uo.grant_type = 'allow'
    limit 1
  ),
  template as (
    select rpt.is_allowed
    from profile p
    join public.role_permission_templates rpt
      on rpt.role = p.role and rpt.permission_key = p_permission_key
    limit 1
  )
  select case
    when not exists (select 1 from profile) then false
    when (select account_status from profile) <> 'active' then false
    -- The owner inherits every permission; overrides cannot remove it.
    when (select role from profile) = 'super_admin' then true
    when exists (select 1 from denial) then false
    when exists (select 1 from allowance) then true
    when exists (select 1 from template where is_allowed = true) then true
    else false
  end;
$function$;
