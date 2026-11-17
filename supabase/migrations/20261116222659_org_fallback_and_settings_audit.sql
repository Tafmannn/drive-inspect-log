-- Applied to production 2026-11-16 (version 20261116222659) and verified: see
-- docs/admin-audit/06-tests.md. Roadmap R-02 + R-09 (docs/admin-audit/07-roadmap.md).
--
-- 1) user_org_id() no longer guesses an organisation.
--    Before: a super admin whose profile has no org was silently treated as a
--    member of the OLDEST organisation, so org-scoped writes (job numbers,
--    invoice numbers, inserts checked against user_org_id()) would land in
--    that org without anyone choosing it. After: it returns the profile's own
--    org_id, or NULL. Super admins still reach every org through the explicit
--    is_super_admin() branch of each policy.
--    No existing account changes: every profile has an org today (0 null).
--
-- 2) Every change to app_settings (feature switches, pricing defaults) is
--    written to admin_audit_log with who, the old value and the new value.
--    Changes made without a signed-in user (migrations, service role) are not
--    logged, since there is no actor to record.
--
-- Re-runnable (CREATE OR REPLACE only; no DROP).
-- Rollback: re-create user_org_id() with the previous body (COALESCE with the
-- oldest-organisation fallback, see 03-findings.md F-08) and
--   drop trigger trg_app_settings_audit on public.app_settings;
--   drop function public.audit_app_settings_change();

create or replace function public.user_org_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select up.org_id
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1
$function$;

create or replace function public.audit_app_settings_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_email text;
begin
  -- No signed-in actor (migration, service role): nothing to attribute.
  if v_actor is null then
    return coalesce(new, old);
  end if;
  -- An update that changes nothing is not a change.
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;
  end if;

  select up.email into v_email from public.user_profiles up where up.auth_user_id = v_actor;

  insert into public.admin_audit_log (performed_by, performed_by_email, action, before_state, after_state)
  values (
    v_actor,
    coalesce(v_email, ''),
    'app_setting_' || lower(tg_op),
    case when tg_op <> 'INSERT' then jsonb_build_object('key', old.key, 'value', old.value) end,
    case when tg_op <> 'DELETE' then jsonb_build_object('key', new.key, 'value', new.value) end
  );
  return coalesce(new, old);
end;
$function$;

-- Trigger functions are not meant to be called directly.
revoke all on function public.audit_app_settings_change() from public, anon, authenticated;

create or replace trigger trg_app_settings_audit
  after insert or update or delete on public.app_settings
  for each row execute function public.audit_app_settings_change();
