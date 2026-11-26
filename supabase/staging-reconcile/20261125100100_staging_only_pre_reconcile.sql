-- STAGING ONLY — never add to supabase/migrations or apply to production.
-- Pre-reconciliation for staging (mfedxybzajdgavzmajkl), applied BEFORE the 48
-- missing repository migrations. Creates the production objects the repository
-- chain presupposes but which NO repository migration creates (they were made
-- out-of-band in production):
--   tables  permissions_catalog, role_permission_templates, user_permission_overrides,
--           permission_audit_log (structure, constraints, indexes, RLS, policies, grants)
--   functions (current production definitions) listed in the [07] blocks below
--   jobs.client_id column + FK; two app_settings policy placeholders that
--   20261111070035 ALTERs (command type matches production; roles/predicates are
--   fully redefined by that migration).
--   Reference rows for permissions_catalog (27) and role_permission_templates (57)
--   copied from production: global product configuration, no user/org data.
-- Source: production catalogue export (scripts/staging/logical-backup/export-schema.sql),
-- extracted with scripts/staging/reconcile/extract-objects.py. Rehearsed on a restored
-- staging copy; final result verified against the production fingerprint.
SET check_function_bodies = off;
-- [06] public.permission_audit_log
CREATE TABLE public.permission_audit_log (id uuid NOT NULL, actor_user_id uuid, actor_email text, target_user_id uuid NOT NULL, permission_key text NOT NULL, action text NOT NULL, old_grant_type text, new_grant_type text, reason text, created_at timestamp with time zone NOT NULL);
-- [06] public.permissions_catalog
CREATE TABLE public.permissions_catalog (key text NOT NULL, label text NOT NULL, category text NOT NULL, description text, is_sensitive boolean NOT NULL, created_at timestamp with time zone NOT NULL);
-- [06] public.role_permission_templates
CREATE TABLE public.role_permission_templates (role text NOT NULL, permission_key text NOT NULL, is_allowed boolean NOT NULL, created_at timestamp with time zone NOT NULL);
-- [06] public.user_permission_overrides
CREATE TABLE public.user_permission_overrides (id uuid NOT NULL, user_id uuid NOT NULL, permission_key text NOT NULL, grant_type text NOT NULL, granted_by uuid, reason text, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL);
-- [07] public.activate_user_account(p_target_user_id uuid)
CREATE OR REPLACE FUNCTION public.activate_user_account(p_target_user_id uuid)
 RETURNS public.user_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_target public.user_profiles;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select *
    into v_target
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if v_target.auth_user_id is null then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if not public.can_actor_manage_target_user(v_actor, p_target_user_id)
     and not public.is_super_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_target.account_status not in ('pending_activation', 'suspended') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.user_profiles
  set
    account_status = 'active',
    activated_at = now(),
    activated_by = v_actor,
    suspended_at = null,
    suspended_by = null,
    suspension_reason = null,
    updated_at = now()
  where auth_user_id = p_target_user_id
  returning * into v_target;

  insert into public.admin_audit_log (
    performed_by,
    performed_by_email,
    action,
    target_user_id,
    target_org_id,
    before_state,
    after_state
  )
  values (
    v_actor,
    public.current_actor_email(),
    'activate_user_account',
    p_target_user_id,
    v_target.org_id,
    jsonb_build_object('account_status', 'pending_or_suspended'),
    jsonb_build_object('account_status', 'active')
  );

  return v_target;
end;
$function$
;
-- [07] public.archive_driver_profile(p_target_user_id uuid, p_reason t
CREATE OR REPLACE FUNCTION public.archive_driver_profile(p_target_user_id uuid, p_reason text DEFAULT NULL::text, p_suspend_account boolean DEFAULT true)
 RETURNS public.driver_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_profile public.user_profiles;
  v_driver public.driver_profiles;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if v_actor = p_target_user_id then
    raise exception 'CANNOT_ARCHIVE_SELF';
  end if;

  select *
    into v_profile
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if v_profile.auth_user_id is null then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if v_profile.role <> 'driver' then
    raise exception 'NOT_A_DRIVER';
  end if;

  if not public.can_actor_manage_target_user(v_actor, p_target_user_id)
     and not public.is_super_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.driver_profiles
  set
    archived_at = now(),
    archived_by = v_actor,
    archive_reason = p_reason,
    is_active = false
  where user_id = p_target_user_id
  returning * into v_driver;

  if v_driver.id is null then
    raise exception 'DRIVER_PROFILE_NOT_FOUND';
  end if;

  if p_suspend_account then
    update public.user_profiles
    set
      account_status = 'suspended',
      suspended_at = now(),
      suspended_by = v_actor,
      suspension_reason = coalesce('Archived driver: ' || p_reason, 'Archived driver'),
      updated_at = now()
    where auth_user_id = p_target_user_id;
  end if;

  insert into public.admin_audit_log (
    performed_by,
    performed_by_email,
    action,
    target_user_id,
    target_org_id,
    before_state,
    after_state
  )
  values (
    v_actor,
    public.current_actor_email(),
    'archive_driver_profile',
    p_target_user_id,
    v_profile.org_id,
    jsonb_build_object('archived_at', null, 'is_active', true),
    jsonb_build_object(
      'archived_at', v_driver.archived_at,
      'is_active', false,
      'reason', p_reason,
      'suspended_account', p_suspend_account
    )
  );

  return v_driver;
end;
$function$
;
-- [07] public.auto_link_job_to_client()
CREATE OR REPLACE FUNCTION public.auto_link_job_to_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_company text := normalize_client_name(new.client_company);
  v_contact text := normalize_client_name(new.client_name);
  v_client_org uuid;
  v_match uuid;
begin
  if new.client_id is not null
     and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    select c.org_id into v_client_org from clients c where c.id = new.client_id;
    if v_client_org is null or v_client_org is distinct from new.org_id then
      raise exception 'client % does not belong to this job''s organisation', new.client_id
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.client_id is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.client_id is not null then
    return new;
  end if;

  if v_company = '' and v_contact = '' then
    return new;
  end if;

  select c.id
    into v_match
    from clients c
   where c.org_id = new.org_id
     and (
       (v_company <> '' and (normalize_client_name(c.company) = v_company
                             or normalize_client_name(c.name) = v_company))
       or (v_contact <> '' and normalize_client_name(c.company) = v_contact)
     )
   order by c.is_active desc, c.created_at asc
   limit 1;

  if v_match is not null then
    new.client_id := v_match;
  end if;

  return new;
end;
$function$
;
-- [07] public.can_actor_manage_permission(p_actor_user_id uuid, p_targ
CREATE OR REPLACE FUNCTION public.can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 actor_role text; actor_org uuid; actor_status text;
 target_org uuid; target_role text; permission_sensitive boolean;
begin
 if p_grant_type not in ('allow','deny') then return false; end if;
 select up.role,up.org_id,up.account_status into actor_role,actor_org,actor_status
 from public.user_profiles up where up.auth_user_id=p_actor_user_id;
 select up.role,up.org_id into target_role,target_org
 from public.user_profiles up where up.auth_user_id=p_target_user_id;
 if actor_role is null or target_role is null or actor_status is distinct from 'active' then return false; end if;
 if not exists(select 1 from public.permissions_catalog where key=p_permission_key) then return false; end if;
 if actor_role='super_admin' then return true; end if;
 if actor_role <> 'admin' then return false; end if;
 if actor_org is distinct from target_org then return false; end if;
 if target_role='super_admin' then return false; end if;
 if p_permission_key='platform.super_admin' then return false; end if;
 select pc.is_sensitive into permission_sensitive from public.permissions_catalog pc where pc.key=p_permission_key;
 if not public.user_has_permission(p_actor_user_id,p_permission_key) then return false; end if;
 if permission_sensitive and p_permission_key in ('users.manage_permissions','users.manage_admins') then return false; end if;
 return true;
end;
$function$
;
-- [07] public.can_actor_manage_target_user(p_actor_user_id uuid, p_tar
CREATE OR REPLACE FUNCTION public.can_actor_manage_target_user(p_actor_user_id uuid, p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_role text;
  actor_org uuid;
  target_role text;
  target_org uuid;
begin
  if p_actor_user_id is null or p_target_user_id is null then
    return false;
  end if;

  if p_actor_user_id = p_target_user_id then
    return false;
  end if;

  select role, org_id
    into actor_role, actor_org
  from public.user_profiles
  where auth_user_id = p_actor_user_id;

  select role, org_id
    into target_role, target_org
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if actor_role is null or target_role is null then
    return false;
  end if;

  if public.is_protected_user(p_target_user_id) then
    return false;
  end if;

  if actor_role = 'super_admin' then
    return true;
  end if;

  if actor_role <> 'admin' then
    return false;
  end if;

  if actor_org is distinct from target_org then
    return false;
  end if;

  if public.role_rank(target_role) >= public.role_rank(actor_role) then
    return false;
  end if;

  return true;
end;
$function$
;
-- [07] public.current_actor_email()
CREATE OR REPLACE FUNCTION public.current_actor_email()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select up.email
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1
$function$
;
-- [07] public.current_user_has_permission(p_permission_key text)
CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.user_has_permission(auth.uid(), p_permission_key)
$function$
;
-- [07] public.delete_user_permission_override(p_target_user_id uuid, p
CREATE OR REPLACE FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.can_actor_manage_permission(v_actor, p_target_user_id, p_permission_key, 'allow') then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.user_permission_overrides
  where user_id = p_target_user_id
    and permission_key = p_permission_key;
end;
$function$
;
-- [07] public.delete_user_permission_override(p_target_user_id uuid, p
CREATE OR REPLACE FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_existing public.user_permission_overrides;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.can_actor_manage_permission(v_actor, p_target_user_id, p_permission_key, 'allow') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select *
    into v_existing
  from public.user_permission_overrides
  where user_id = p_target_user_id
    and permission_key = p_permission_key;

  if v_existing.id is null then
    return;
  end if;

  delete from public.user_permission_overrides
  where user_id = p_target_user_id
    and permission_key = p_permission_key;

  insert into public.permission_audit_log (
    actor_user_id,
    actor_email,
    target_user_id,
    permission_key,
    action,
    old_grant_type,
    new_grant_type,
    reason
  )
  values (
    v_actor,
    public.current_actor_email(),
    p_target_user_id,
    p_permission_key,
    'delete_override',
    v_existing.grant_type,
    null,
    p_reason
  );
end;
$function$
;
-- [07] public.is_protected_user(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.is_protected_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(up.is_protected, false)
  from public.user_profiles up
  where up.auth_user_id = p_user_id
  limit 1
$function$
;
-- [07] public.link_photo_to_inspection_on_insert()
CREATE OR REPLACE FUNCTION public.link_photo_to_inspection_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inspection_type text;
  v_inspection_id uuid;
begin
  -- Only act when inspection_id is not already set
  if new.inspection_id is not null then
    return new;
  end if;

  -- Map photo.type -> inspection.type when possible
  if new.type like 'pickup%' then
    v_inspection_type := 'pickup';
  elsif new.type like 'delivery%' then
    v_inspection_type := 'delivery';
  else
    v_inspection_type := null;
  end if;

  -- Prefer matching inspection type when we can
  if v_inspection_type is not null then
    select i.id into v_inspection_id
    from public.inspections i
    where i.job_id = new.job_id
      and i.type = v_inspection_type
    order by i.inspected_at desc nulls last, i.created_at desc
    limit 1;
  else
    v_inspection_id := null;
  end if;

  -- Fallback: link to latest inspection for the job
  if v_inspection_id is null then
    select i.id into v_inspection_id
    from public.inspections i
    where i.job_id = new.job_id
    order by i.inspected_at desc nulls last, i.created_at desc
    limit 1;
  end if;

  if v_inspection_id is not null then
    update public.photos p
      set inspection_id = v_inspection_id
    where p.id = new.id;
  end if;

  return new;
end;
$function$
;
-- [07] public.link_photo_to_inspection_on_update()
CREATE OR REPLACE FUNCTION public.link_photo_to_inspection_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inspection_type text;
  v_inspection_id uuid;
begin
  -- Only attempt if inspection_id is null after the update
  if new.inspection_id is not null then
    return new;
  end if;

  -- Determine mapped inspection type based on new.type
  if new.type like 'pickup%' then
    v_inspection_type := 'pickup';
  elsif new.type like 'delivery%' then
    v_inspection_type := 'delivery';
  else
    v_inspection_type := null;
  end if;

  -- Prefer matching inspection type when possible
  if v_inspection_type is not null then
    select i.id into v_inspection_id
    from public.inspections i
    where i.job_id = new.job_id
      and i.type = v_inspection_type
    order by i.inspected_at desc nulls last, i.created_at desc
    limit 1;
  else
    v_inspection_id := null;
  end if;

  -- Fallback to latest inspection for the job
  if v_inspection_id is null then
    select i.id into v_inspection_id
    from public.inspections i
    where i.job_id = new.job_id
    order by i.inspected_at desc nulls last, i.created_at desc
    limit 1;
  end if;

  if v_inspection_id is not null then
    update public.photos p
      set inspection_id = v_inspection_id
    where p.id = new.id;
  end if;

  return new;
end;
$function$
;
-- [07] public.link_unlinked_photos_to_inspection(p_job_id uuid, p_org_
CREATE OR REPLACE FUNCTION public.link_unlinked_photos_to_inspection(p_job_id uuid, p_org_id uuid, p_inspection_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_inspection_id uuid;
begin
  if p_inspection_type not in ('pickup','delivery') then
    return;
  end if;

  select i.id
    into v_target_inspection_id
  from public.inspections i
  where i.job_id = p_job_id
    and i.type = p_inspection_type
  order by i.inspected_at desc nulls last, i.created_at desc
  limit 1;

  if v_target_inspection_id is null then
    return;
  end if;

  if p_inspection_type = 'pickup' then
    update public.photos p
      set inspection_id = v_target_inspection_id,
          updated_at = now()
    where p.inspection_id is null
      and p.job_id = p_job_id
      and p.org_id = p_org_id
      and (
        p.type like 'pickup%'
        or p.type = 'damage_close_up'
      );

  elsif p_inspection_type = 'delivery' then
    update public.photos p
      set inspection_id = v_target_inspection_id,
          updated_at = now()
    where p.inspection_id is null
      and p.job_id = p_job_id
      and p.org_id = p_org_id
      and p.type like 'delivery%';
  end if;

end;
$function$
;
-- [07] public.normalize_client_name(input text)
CREATE OR REPLACE FUNCTION public.normalize_client_name(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select regexp_replace(
    lower(trim(coalesce(input, ''))),
    '[^a-z0-9]+',
    '',
    'g'
  );
$function$
;
-- [07] public.restore_driver_profile(p_target_user_id uuid, p_restore_
CREATE OR REPLACE FUNCTION public.restore_driver_profile(p_target_user_id uuid, p_restore_note text DEFAULT NULL::text, p_reactivate_account boolean DEFAULT false)
 RETURNS public.driver_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_profile public.user_profiles;
  v_driver public.driver_profiles;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select *
    into v_profile
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if v_profile.auth_user_id is null then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if v_profile.role <> 'driver' then
    raise exception 'NOT_A_DRIVER';
  end if;

  if not public.can_actor_manage_target_user(v_actor, p_target_user_id)
     and not public.is_super_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.driver_profiles
  set
    archived_at = null,
    archived_by = null,
    archive_reason = null,
    restored_at = now(),
    restored_by = v_actor,
    restore_note = p_restore_note,
    is_active = true
  where user_id = p_target_user_id
  returning * into v_driver;

  if v_driver.id is null then
    raise exception 'DRIVER_PROFILE_NOT_FOUND';
  end if;

  if p_reactivate_account then
    update public.user_profiles
    set
      account_status = 'active',
      activated_at = now(),
      activated_by = v_actor,
      suspended_at = null,
      suspended_by = null,
      suspension_reason = null,
      updated_at = now()
    where auth_user_id = p_target_user_id;
  end if;

  insert into public.admin_audit_log (
    performed_by,
    performed_by_email,
    action,
    target_user_id,
    target_org_id,
    before_state,
    after_state
  )
  values (
    v_actor,
    public.current_actor_email(),
    'restore_driver_profile',
    p_target_user_id,
    v_profile.org_id,
    jsonb_build_object('archived_at', 'not_null', 'is_active', false),
    jsonb_build_object(
      'archived_at', null,
      'is_active', true,
      'restore_note', p_restore_note,
      'reactivate_account', p_reactivate_account
    )
  );

  return v_driver;
end;
$function$
;
-- [07] public.role_rank(p_role text)
CREATE OR REPLACE FUNCTION public.role_rank(p_role text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_role = 'driver' then 1
    when p_role = 'admin' then 2
    when p_role = 'super_admin' then 3
    else 0
  end
$function$
;
-- [07] public.suspend_user_account(p_target_user_id uuid, p_reason tex
CREATE OR REPLACE FUNCTION public.suspend_user_account(p_target_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS public.user_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_target public.user_profiles;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if v_actor = p_target_user_id then
    raise exception 'CANNOT_SUSPEND_SELF';
  end if;

  select *
    into v_target
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if v_target.auth_user_id is null then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if not public.can_actor_manage_target_user(v_actor, p_target_user_id)
     and not public.is_super_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_target.account_status <> 'active' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.user_profiles
  set
    account_status = 'suspended',
    suspended_at = now(),
    suspended_by = v_actor,
    suspension_reason = p_reason,
    updated_at = now()
  where auth_user_id = p_target_user_id
  returning * into v_target;

  insert into public.admin_audit_log (
    performed_by,
    performed_by_email,
    action,
    target_user_id,
    target_org_id,
    before_state,
    after_state
  )
  values (
    v_actor,
    public.current_actor_email(),
    'suspend_user_account',
    p_target_user_id,
    v_target.org_id,
    jsonb_build_object('account_status', 'active'),
    jsonb_build_object('account_status', 'suspended', 'reason', p_reason)
  );

  return v_target;
end;
$function$
;
-- [07] public.trg_inspections_link_photos()
CREATE OR REPLACE FUNCTION public.trg_inspections_link_photos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.link_unlinked_photos_to_inspection(new.job_id, new.org_id, new.type);
  return new;
end;
$function$
;
-- [07] public.upsert_user_permission_override(p_target_user_id uuid, p
CREATE OR REPLACE FUNCTION public.upsert_user_permission_override(p_target_user_id uuid, p_permission_key text, p_grant_type text, p_reason text DEFAULT NULL::text)
 RETURNS public.user_permission_overrides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_existing public.user_permission_overrides;
  v_row public.user_permission_overrides;
  v_action text;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.can_actor_manage_permission(v_actor, p_target_user_id, p_permission_key, p_grant_type) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select *
    into v_existing
  from public.user_permission_overrides
  where user_id = p_target_user_id
    and permission_key = p_permission_key;

  insert into public.user_permission_overrides (
    user_id,
    permission_key,
    grant_type,
    granted_by,
    reason
  )
  values (
    p_target_user_id,
    p_permission_key,
    p_grant_type,
    v_actor,
    p_reason
  )
  on conflict (user_id, permission_key)
  do update set
    grant_type = excluded.grant_type,
    granted_by = excluded.granted_by,
    reason = excluded.reason,
    updated_at = now()
  returning * into v_row;

  v_action := case when v_existing.id is null then 'create_override' else 'update_override' end;

  insert into public.permission_audit_log (
    actor_user_id,
    actor_email,
    target_user_id,
    permission_key,
    action,
    old_grant_type,
    new_grant_type,
    reason
  )
  values (
    v_actor,
    public.current_actor_email(),
    p_target_user_id,
    p_permission_key,
    v_action,
    v_existing.grant_type,
    p_grant_type,
    p_reason
  );

  return v_row;
end;
$function$
;
-- [09] permission_audit_logcreated_at
ALTER TABLE ONLY public.permission_audit_log ALTER COLUMN created_at SET DEFAULT now();
-- [09] permission_audit_logid
ALTER TABLE ONLY public.permission_audit_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] permissions_catalogcreated_at
ALTER TABLE ONLY public.permissions_catalog ALTER COLUMN created_at SET DEFAULT now();
-- [09] permissions_catalogis_sensitive
ALTER TABLE ONLY public.permissions_catalog ALTER COLUMN is_sensitive SET DEFAULT false;
-- [09] role_permission_templatescreated_at
ALTER TABLE ONLY public.role_permission_templates ALTER COLUMN created_at SET DEFAULT now();
-- [09] role_permission_templatesis_allowed
ALTER TABLE ONLY public.role_permission_templates ALTER COLUMN is_allowed SET DEFAULT true;
-- [09] user_permission_overridescreated_at
ALTER TABLE ONLY public.user_permission_overrides ALTER COLUMN created_at SET DEFAULT now();
-- [09] user_permission_overridesid
ALTER TABLE ONLY public.user_permission_overrides ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] user_permission_overridesupdated_at
ALTER TABLE ONLY public.user_permission_overrides ALTER COLUMN updated_at SET DEFAULT now();
-- [10] publicpermission_audit_logpermission_audit_log_action_check
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_action_check CHECK ((action = ANY (ARRAY['create_override'::text, 'update_override'::text, 'delete_override'::text])));
-- [10] publicpermission_audit_logpermission_audit_log_pkey
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_pkey PRIMARY KEY (id);
-- [10] publicpermissions_catalogpermissions_catalog_category_check
ALTER TABLE ONLY public.permissions_catalog ADD CONSTRAINT permissions_catalog_category_check CHECK ((category = ANY (ARRAY['jobs'::text, 'users'::text, 'drivers'::text, 'expenses'::text, 'reports'::text, 'pod'::text, 'organisation'::text, 'system'::text, 'platform'::text])));
-- [10] publicpermissions_catalogpermissions_catalog_pkey
ALTER TABLE ONLY public.permissions_catalog ADD CONSTRAINT permissions_catalog_pkey PRIMARY KEY (key);
-- [10] publicrole_permission_templatesrole_permission_templates_pkey
ALTER TABLE ONLY public.role_permission_templates ADD CONSTRAINT role_permission_templates_pkey PRIMARY KEY (role, permission_key);
-- [10] publicrole_permission_templatesrole_permission_templates_role_c
ALTER TABLE ONLY public.role_permission_templates ADD CONSTRAINT role_permission_templates_role_check CHECK ((role = ANY (ARRAY['driver'::text, 'admin'::text, 'super_admin'::text])));
-- [10] publicuser_permission_overridesuser_permission_overrides_grant_
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_grant_type_check CHECK ((grant_type = ANY (ARRAY['allow'::text, 'deny'::text])));
-- [10] publicuser_permission_overridesuser_permission_overrides_pkey
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_pkey PRIMARY KEY (id);
-- [10] publicuser_permission_overridesuser_permission_overrides_user_i
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_user_id_permission_key_key UNIQUE (user_id, permission_key);
-- [11] publicpermission_audit_logpermission_audit_log_actor_user_id_fk
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.user_profiles(auth_user_id) ON DELETE SET NULL;
-- [11] publicpermission_audit_logpermission_audit_log_permission_key_f
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.permissions_catalog(key) ON DELETE CASCADE;
-- [11] publicpermission_audit_logpermission_audit_log_target_user_id_f
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.user_profiles(auth_user_id) ON DELETE CASCADE;
-- [11] publicrole_permission_templatesrole_permission_templates_permis
ALTER TABLE ONLY public.role_permission_templates ADD CONSTRAINT role_permission_templates_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.permissions_catalog(key) ON DELETE CASCADE;
-- [11] publicuser_permission_overridesuser_permission_overrides_grante
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.user_profiles(auth_user_id) ON DELETE SET NULL;
-- [11] publicuser_permission_overridesuser_permission_overrides_permis
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.permissions_catalog(key) ON DELETE CASCADE;
-- [11] publicuser_permission_overridesuser_permission_overrides_user_i
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(auth_user_id) ON DELETE CASCADE;
-- [12] idx_permission_audit_log_created_at
CREATE INDEX idx_permission_audit_log_created_at ON public.permission_audit_log USING btree (created_at DESC);
-- [12] idx_permission_audit_log_permission_key
CREATE INDEX idx_permission_audit_log_permission_key ON public.permission_audit_log USING btree (permission_key);
-- [12] idx_permission_audit_log_target_user_id
CREATE INDEX idx_permission_audit_log_target_user_id ON public.permission_audit_log USING btree (target_user_id);
-- [12] idx_role_permission_templates_permission_key
CREATE INDEX idx_role_permission_templates_permission_key ON public.role_permission_templates USING btree (permission_key);
-- [12] idx_role_permission_templates_role
CREATE INDEX idx_role_permission_templates_role ON public.role_permission_templates USING btree (role);
-- [12] idx_user_permission_overrides_permission_key
CREATE INDEX idx_user_permission_overrides_permission_key ON public.user_permission_overrides USING btree (permission_key);
-- [12] idx_user_permission_overrides_user_id
CREATE INDEX idx_user_permission_overrides_user_id ON public.user_permission_overrides USING btree (user_id);
-- [12] idx_user_permission_overrides_user_permission
CREATE INDEX idx_user_permission_overrides_user_permission ON public.user_permission_overrides USING btree (user_id, permission_key);
-- [13] user_permission_overridestrg_user_permission_overrides_updated_
CREATE TRIGGER trg_user_permission_overrides_updated_at BEFORE UPDATE ON public.user_permission_overrides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- [14] publicpermission_audit_log
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
-- [14] publicpermissions_catalog
ALTER TABLE public.permissions_catalog ENABLE ROW LEVEL SECURITY;
-- [14] publicrole_permission_templates
ALTER TABLE public.role_permission_templates ENABLE ROW LEVEL SECURITY;
-- [14] publicuser_permission_overrides
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
-- [15] publicpermission_audit_logpermission_audit_log_select_scoped
CREATE POLICY permission_audit_log_select_scoped ON public.permission_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (target_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.user_profiles actor
     JOIN public.user_profiles target ON ((target.auth_user_id = permission_audit_log.target_user_id)))
  WHERE ((actor.auth_user_id = auth.uid()) AND (actor.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (actor.org_id = target.org_id))))));
-- [15] publicpermissions_catalogpermissions_catalog_select_authenticat
CREATE POLICY permissions_catalog_select_authenticated ON public.permissions_catalog AS PERMISSIVE FOR SELECT TO authenticated USING (true);
-- [15] publicrole_permission_templatesrole_permission_templates_select
CREATE POLICY role_permission_templates_select_authenticated ON public.role_permission_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
-- [15] publicuser_permission_overridesuser_permission_overrides_select
CREATE POLICY user_permission_overrides_select_scoped ON public.user_permission_overrides AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM (public.user_profiles actor
     JOIN public.user_profiles target ON ((target.auth_user_id = user_permission_overrides.user_id)))
  WHERE ((actor.auth_user_id = auth.uid()) AND (actor.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (actor.org_id = target.org_id))))));
-- [16] fpublic.activate_user_account(p_target_user_id uuid)
ALTER FUNCTION public.activate_user_account(p_target_user_id uuid) OWNER TO postgres;
-- [16] fpublic.archive_driver_profile(p_target_user_id uuid, p_reason 
ALTER FUNCTION public.archive_driver_profile(p_target_user_id uuid, p_reason text, p_suspend_account boolean) OWNER TO postgres;
-- [16] fpublic.auto_link_job_to_client()
ALTER FUNCTION public.auto_link_job_to_client() OWNER TO postgres;
-- [16] fpublic.can_actor_manage_permission(p_actor_user_id uuid, p_tar
ALTER FUNCTION public.can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text) OWNER TO postgres;
-- [16] fpublic.can_actor_manage_target_user(p_actor_user_id uuid, p_ta
ALTER FUNCTION public.can_actor_manage_target_user(p_actor_user_id uuid, p_target_user_id uuid) OWNER TO postgres;
-- [16] fpublic.current_actor_email()
ALTER FUNCTION public.current_actor_email() OWNER TO postgres;
-- [16] fpublic.current_user_has_permission(p_permission_key text)
ALTER FUNCTION public.current_user_has_permission(p_permission_key text) OWNER TO postgres;
-- [16] fpublic.delete_user_permission_override(p_target_user_id uuid, 
ALTER FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text) OWNER TO postgres;
-- [16] fpublic.delete_user_permission_override(p_target_user_id uuid, 
ALTER FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text, p_reason text) OWNER TO postgres;
-- [16] fpublic.is_protected_user(p_user_id uuid)
ALTER FUNCTION public.is_protected_user(p_user_id uuid) OWNER TO postgres;
-- [16] fpublic.link_photo_to_inspection_on_insert()
ALTER FUNCTION public.link_photo_to_inspection_on_insert() OWNER TO postgres;
-- [16] fpublic.link_photo_to_inspection_on_update()
ALTER FUNCTION public.link_photo_to_inspection_on_update() OWNER TO postgres;
-- [16] fpublic.link_unlinked_photos_to_inspection(p_job_id uuid, p_org
ALTER FUNCTION public.link_unlinked_photos_to_inspection(p_job_id uuid, p_org_id uuid, p_inspection_type text) OWNER TO postgres;
-- [16] fpublic.normalize_client_name(input text)
ALTER FUNCTION public.normalize_client_name(input text) OWNER TO postgres;
-- [16] fpublic.restore_driver_profile(p_target_user_id uuid, p_restore
ALTER FUNCTION public.restore_driver_profile(p_target_user_id uuid, p_restore_note text, p_reactivate_account boolean) OWNER TO postgres;
-- [16] fpublic.role_rank(p_role text)
ALTER FUNCTION public.role_rank(p_role text) OWNER TO postgres;
-- [16] fpublic.suspend_user_account(p_target_user_id uuid, p_reason te
ALTER FUNCTION public.suspend_user_account(p_target_user_id uuid, p_reason text) OWNER TO postgres;
-- [16] fpublic.trg_inspections_link_photos()
ALTER FUNCTION public.trg_inspections_link_photos() OWNER TO postgres;
-- [16] fpublic.upsert_user_permission_override(p_target_user_id uuid, 
ALTER FUNCTION public.upsert_user_permission_override(p_target_user_id uuid, p_permission_key text, p_grant_type text, p_reason text) OWNER TO postgres;
-- [16] publicpermission_audit_log
ALTER TABLE public.permission_audit_log OWNER TO postgres;
-- [16] publicpermissions_catalog
ALTER TABLE public.permissions_catalog OWNER TO postgres;
-- [16] publicrole_permission_templates
ALTER TABLE public.role_permission_templates OWNER TO postgres;
-- [16] publicuser_permission_overrides
ALTER TABLE public.user_permission_overrides OWNER TO postgres;
-- [17] apublicpermission_audit_log
REVOKE ALL ON TABLE public.permission_audit_log FROM PUBLIC;
-- [17] apublicpermissions_catalog
REVOKE ALL ON TABLE public.permissions_catalog FROM PUBLIC;
-- [17] apublicrole_permission_templates
REVOKE ALL ON TABLE public.role_permission_templates FROM PUBLIC;
-- [17] apublicuser_permission_overrides
REVOKE ALL ON TABLE public.user_permission_overrides FROM PUBLIC;
-- [17] bpublicpermission_audit_log16480DELETE
GRANT DELETE ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480INSERT
GRANT INSERT ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480MAINTAIN
GRANT MAINTAIN ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480REFERENCES
GRANT REFERENCES ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480SELECT
GRANT SELECT ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480TRIGGER
GRANT TRIGGER ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480TRUNCATE
GRANT TRUNCATE ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480UPDATE
GRANT UPDATE ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16481MAINTAIN
GRANT MAINTAIN ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16481REFERENCES
GRANT REFERENCES ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16481SELECT
GRANT SELECT ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16481TRIGGER
GRANT TRIGGER ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16481TRUNCATE
GRANT TRUNCATE ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16482DELETE
GRANT DELETE ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482INSERT
GRANT INSERT ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482MAINTAIN
GRANT MAINTAIN ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482REFERENCES
GRANT REFERENCES ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482SELECT
GRANT SELECT ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482TRIGGER
GRANT TRIGGER ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482TRUNCATE
GRANT TRUNCATE ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482UPDATE
GRANT UPDATE ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermissions_catalog16480DELETE
GRANT DELETE ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480INSERT
GRANT INSERT ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480MAINTAIN
GRANT MAINTAIN ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480REFERENCES
GRANT REFERENCES ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480SELECT
GRANT SELECT ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480TRIGGER
GRANT TRIGGER ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480TRUNCATE
GRANT TRUNCATE ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480UPDATE
GRANT UPDATE ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16481MAINTAIN
GRANT MAINTAIN ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16481REFERENCES
GRANT REFERENCES ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16481SELECT
GRANT SELECT ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16481TRIGGER
GRANT TRIGGER ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16481TRUNCATE
GRANT TRUNCATE ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16482DELETE
GRANT DELETE ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482INSERT
GRANT INSERT ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482MAINTAIN
GRANT MAINTAIN ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482REFERENCES
GRANT REFERENCES ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482SELECT
GRANT SELECT ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482TRIGGER
GRANT TRIGGER ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482TRUNCATE
GRANT TRUNCATE ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482UPDATE
GRANT UPDATE ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicrole_permission_templates16480DELETE
GRANT DELETE ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480INSERT
GRANT INSERT ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480MAINTAIN
GRANT MAINTAIN ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480REFERENCES
GRANT REFERENCES ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480SELECT
GRANT SELECT ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480TRIGGER
GRANT TRIGGER ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480TRUNCATE
GRANT TRUNCATE ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480UPDATE
GRANT UPDATE ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16481MAINTAIN
GRANT MAINTAIN ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16481REFERENCES
GRANT REFERENCES ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16481SELECT
GRANT SELECT ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16481TRIGGER
GRANT TRIGGER ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16481TRUNCATE
GRANT TRUNCATE ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16482DELETE
GRANT DELETE ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482INSERT
GRANT INSERT ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482MAINTAIN
GRANT MAINTAIN ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482REFERENCES
GRANT REFERENCES ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482SELECT
GRANT SELECT ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482TRIGGER
GRANT TRIGGER ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482TRUNCATE
GRANT TRUNCATE ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482UPDATE
GRANT UPDATE ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicuser_permission_overrides16480DELETE
GRANT DELETE ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480INSERT
GRANT INSERT ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480REFERENCES
GRANT REFERENCES ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480SELECT
GRANT SELECT ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480TRIGGER
GRANT TRIGGER ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480UPDATE
GRANT UPDATE ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16481MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16481REFERENCES
GRANT REFERENCES ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16481SELECT
GRANT SELECT ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16481TRIGGER
GRANT TRIGGER ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16481TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16482DELETE
GRANT DELETE ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482INSERT
GRANT INSERT ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482REFERENCES
GRANT REFERENCES ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482SELECT
GRANT SELECT ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482TRIGGER
GRANT TRIGGER ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482UPDATE
GRANT UPDATE ON TABLE public.user_permission_overrides TO service_role;
-- [17] dpublic.activate_user_account(p_target_user_id uuid)
REVOKE ALL ON FUNCTION public.activate_user_account(p_target_user_id uuid) FROM PUBLIC;
-- [17] dpublic.archive_driver_profile(p_target_user_id uuid, p_reason 
REVOKE ALL ON FUNCTION public.archive_driver_profile(p_target_user_id uuid, p_reason text, p_suspend_account boolean) FROM PUBLIC;
-- [17] dpublic.auto_link_job_to_client()
REVOKE ALL ON FUNCTION public.auto_link_job_to_client() FROM PUBLIC;
-- [17] dpublic.can_actor_manage_permission(p_actor_user_id uuid, p_tar
REVOKE ALL ON FUNCTION public.can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text) FROM PUBLIC;
-- [17] dpublic.can_actor_manage_target_user(p_actor_user_id uuid, p_ta
REVOKE ALL ON FUNCTION public.can_actor_manage_target_user(p_actor_user_id uuid, p_target_user_id uuid) FROM PUBLIC;
-- [17] dpublic.current_actor_email()
REVOKE ALL ON FUNCTION public.current_actor_email() FROM PUBLIC;
-- [17] dpublic.current_user_has_permission(p_permission_key text)
REVOKE ALL ON FUNCTION public.current_user_has_permission(p_permission_key text) FROM PUBLIC;
-- [17] dpublic.delete_user_permission_override(p_target_user_id uuid, 
REVOKE ALL ON FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text) FROM PUBLIC;
-- [17] dpublic.delete_user_permission_override(p_target_user_id uuid, 
REVOKE ALL ON FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text, p_reason text) FROM PUBLIC;
-- [17] dpublic.is_protected_user(p_user_id uuid)
REVOKE ALL ON FUNCTION public.is_protected_user(p_user_id uuid) FROM PUBLIC;
-- [17] dpublic.link_photo_to_inspection_on_insert()
REVOKE ALL ON FUNCTION public.link_photo_to_inspection_on_insert() FROM PUBLIC;
-- [17] dpublic.link_photo_to_inspection_on_update()
REVOKE ALL ON FUNCTION public.link_photo_to_inspection_on_update() FROM PUBLIC;
-- [17] dpublic.link_unlinked_photos_to_inspection(p_job_id uuid, p_org
REVOKE ALL ON FUNCTION public.link_unlinked_photos_to_inspection(p_job_id uuid, p_org_id uuid, p_inspection_type text) FROM PUBLIC;
-- [17] dpublic.normalize_client_name(input text)
REVOKE ALL ON FUNCTION public.normalize_client_name(input text) FROM PUBLIC;
-- [17] dpublic.restore_driver_profile(p_target_user_id uuid, p_restore
REVOKE ALL ON FUNCTION public.restore_driver_profile(p_target_user_id uuid, p_restore_note text, p_reactivate_account boolean) FROM PUBLIC;
-- [17] dpublic.role_rank(p_role text)
REVOKE ALL ON FUNCTION public.role_rank(p_role text) FROM PUBLIC;
-- [17] dpublic.suspend_user_account(p_target_user_id uuid, p_reason te
REVOKE ALL ON FUNCTION public.suspend_user_account(p_target_user_id uuid, p_reason text) FROM PUBLIC;
-- [17] dpublic.trg_inspections_link_photos()
REVOKE ALL ON FUNCTION public.trg_inspections_link_photos() FROM PUBLIC;
-- [17] dpublic.upsert_user_permission_override(p_target_user_id uuid, 
REVOKE ALL ON FUNCTION public.upsert_user_permission_override(p_target_user_id uuid, p_permission_key text, p_grant_type text, p_reason text) FROM PUBLIC;
-- [17] epublic.activate_user_account(p_target_user_id uuid)16482
GRANT EXECUTE ON FUNCTION public.activate_user_account(p_target_user_id uuid) TO service_role;
-- [17] epublic.archive_driver_profile(p_target_user_id uuid, p_reason 
GRANT EXECUTE ON FUNCTION public.archive_driver_profile(p_target_user_id uuid, p_reason text, p_suspend_account boolean) TO service_role;
-- [17] epublic.auto_link_job_to_client()0
GRANT EXECUTE ON FUNCTION public.auto_link_job_to_client() TO PUBLIC;
-- [17] epublic.auto_link_job_to_client()16480
GRANT EXECUTE ON FUNCTION public.auto_link_job_to_client() TO anon;
-- [17] epublic.auto_link_job_to_client()16481
GRANT EXECUTE ON FUNCTION public.auto_link_job_to_client() TO authenticated;
-- [17] epublic.auto_link_job_to_client()16482
GRANT EXECUTE ON FUNCTION public.auto_link_job_to_client() TO service_role;
-- [17] epublic.can_actor_manage_permission(p_actor_user_id uuid, p_tar
GRANT EXECUTE ON FUNCTION public.can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text) TO service_role;
-- [17] epublic.can_actor_manage_target_user(p_actor_user_id uuid, p_ta
GRANT EXECUTE ON FUNCTION public.can_actor_manage_target_user(p_actor_user_id uuid, p_target_user_id uuid) TO service_role;
-- [17] epublic.current_actor_email()0
GRANT EXECUTE ON FUNCTION public.current_actor_email() TO PUBLIC;
-- [17] epublic.current_actor_email()16480
GRANT EXECUTE ON FUNCTION public.current_actor_email() TO anon;
-- [17] epublic.current_actor_email()16481
GRANT EXECUTE ON FUNCTION public.current_actor_email() TO authenticated;
-- [17] epublic.current_actor_email()16482
GRANT EXECUTE ON FUNCTION public.current_actor_email() TO service_role;
-- [17] epublic.current_user_has_permission(p_permission_key text)0
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(p_permission_key text) TO PUBLIC;
-- [17] epublic.current_user_has_permission(p_permission_key text)16480
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(p_permission_key text) TO anon;
-- [17] epublic.current_user_has_permission(p_permission_key text)16481
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(p_permission_key text) TO authenticated;
-- [17] epublic.current_user_has_permission(p_permission_key text)16482
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(p_permission_key text) TO service_role;
-- [17] epublic.delete_user_permission_override(p_target_user_id uuid, 
GRANT EXECUTE ON FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text) TO service_role;
-- [17] epublic.delete_user_permission_override(p_target_user_id uuid, 
GRANT EXECUTE ON FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text, p_reason text) TO service_role;
-- [17] epublic.is_protected_user(p_user_id uuid)0
GRANT EXECUTE ON FUNCTION public.is_protected_user(p_user_id uuid) TO PUBLIC;
-- [17] epublic.is_protected_user(p_user_id uuid)16480
GRANT EXECUTE ON FUNCTION public.is_protected_user(p_user_id uuid) TO anon;
-- [17] epublic.is_protected_user(p_user_id uuid)16481
GRANT EXECUTE ON FUNCTION public.is_protected_user(p_user_id uuid) TO authenticated;
-- [17] epublic.is_protected_user(p_user_id uuid)16482
GRANT EXECUTE ON FUNCTION public.is_protected_user(p_user_id uuid) TO service_role;
-- [17] epublic.link_photo_to_inspection_on_insert()16482
GRANT EXECUTE ON FUNCTION public.link_photo_to_inspection_on_insert() TO service_role;
-- [17] epublic.link_photo_to_inspection_on_update()16482
GRANT EXECUTE ON FUNCTION public.link_photo_to_inspection_on_update() TO service_role;
-- [17] epublic.link_unlinked_photos_to_inspection(p_job_id uuid, p_org
GRANT EXECUTE ON FUNCTION public.link_unlinked_photos_to_inspection(p_job_id uuid, p_org_id uuid, p_inspection_type text) TO service_role;
-- [17] epublic.normalize_client_name(input text)0
GRANT EXECUTE ON FUNCTION public.normalize_client_name(input text) TO PUBLIC;
-- [17] epublic.normalize_client_name(input text)16480
GRANT EXECUTE ON FUNCTION public.normalize_client_name(input text) TO anon;
-- [17] epublic.normalize_client_name(input text)16481
GRANT EXECUTE ON FUNCTION public.normalize_client_name(input text) TO authenticated;
-- [17] epublic.normalize_client_name(input text)16482
GRANT EXECUTE ON FUNCTION public.normalize_client_name(input text) TO service_role;
-- [17] epublic.restore_driver_profile(p_target_user_id uuid, p_restore
GRANT EXECUTE ON FUNCTION public.restore_driver_profile(p_target_user_id uuid, p_restore_note text, p_reactivate_account boolean) TO service_role;
-- [17] epublic.role_rank(p_role text)0
GRANT EXECUTE ON FUNCTION public.role_rank(p_role text) TO PUBLIC;
-- [17] epublic.role_rank(p_role text)16480
GRANT EXECUTE ON FUNCTION public.role_rank(p_role text) TO anon;
-- [17] epublic.role_rank(p_role text)16481
GRANT EXECUTE ON FUNCTION public.role_rank(p_role text) TO authenticated;
-- [17] epublic.role_rank(p_role text)16482
GRANT EXECUTE ON FUNCTION public.role_rank(p_role text) TO service_role;
-- [17] epublic.suspend_user_account(p_target_user_id uuid, p_reason te
GRANT EXECUTE ON FUNCTION public.suspend_user_account(p_target_user_id uuid, p_reason text) TO service_role;
-- [17] epublic.trg_inspections_link_photos()16482
GRANT EXECUTE ON FUNCTION public.trg_inspections_link_photos() TO service_role;
-- [17] epublic.upsert_user_permission_override(p_target_user_id uuid, 
GRANT EXECUTE ON FUNCTION public.upsert_user_permission_override(p_target_user_id uuid, p_permission_key text, p_grant_type text, p_reason text) TO service_role;

-- ---- reference data (production, configuration only) ----
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('drivers.manage','Manage drivers','drivers','Can manage driver profiles','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('drivers.view','View drivers','drivers','Can view driver profiles','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('expenses.manage','Manage expenses','expenses','Can manage expenses','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('expenses.view','View expenses','expenses','Can view expenses','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('jobs.assign','Assign jobs','jobs','Can assign jobs to drivers','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('jobs.create','Create jobs','jobs','Can create new jobs','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('jobs.delete','Delete jobs','jobs','Can delete jobs','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('jobs.edit','Edit jobs','jobs','Can edit existing jobs','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('jobs.view','View jobs','jobs','Can view jobs relevant to scope','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('jobs.view_all_org','View all org jobs','jobs','Can view all jobs in organisation','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('organisation.manage','Manage organisation','organisation','Can manage organisation-level settings','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('organisation.view','View organisation','organisation','Can view organisation settings/data','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('platform.super_admin','Super admin access','platform','Platform-wide super admin authority','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('pod.manage','Manage PODs','pod','Can manage POD generation and corrections','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('pod.view','View PODs','pod','Can view POD documents','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('reports.export','Export data','reports','Can export reports and operational data','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('reports.view','View reports','reports','Can view reports','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('system.settings','Manage system settings','system','Can manage high-level settings in allowed scope','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('users.activate','Activate users','users','Can activate pending users','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('users.archive_driver','Archive drivers','drivers','Can archive driver operational profiles','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('users.create','Create users','users','Can create users in allowed scope','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('users.edit','Edit users','users','Can edit users in allowed scope','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('users.manage_admins','Manage admins','users','Can create or modify admin users','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('users.manage_permissions','Manage permissions','users','Can assign user permission overrides','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('users.restore_driver','Restore drivers','drivers','Can restore archived drivers','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('users.suspend','Suspend users','users','Can suspend active users','t','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.permissions_catalog (key,label,category,description,is_sensitive,created_at) VALUES ('users.view','View users','users','Can view users in allowed scope','f','2026-03-17 12:47:47.905873+00') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','drivers.manage','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','drivers.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','expenses.manage','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','expenses.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','jobs.assign','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','jobs.create','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','jobs.edit','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','jobs.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','jobs.view_all_org','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','organisation.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','platform.super_admin','f','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','pod.manage','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','pod.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','reports.export','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','reports.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','users.activate','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','users.archive_driver','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','users.create','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','users.edit','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','users.manage_admins','f','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','users.manage_permissions','f','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','users.restore_driver','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','users.suspend','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('admin','users.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('driver','drivers.view','f','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('driver','expenses.manage','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('driver','expenses.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('driver','jobs.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('driver','platform.super_admin','f','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('driver','pod.view','f','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','drivers.manage','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','drivers.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','expenses.manage','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','expenses.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','jobs.assign','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','jobs.create','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','jobs.delete','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','jobs.edit','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','jobs.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','jobs.view_all_org','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','organisation.manage','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','organisation.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','platform.super_admin','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','pod.manage','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','pod.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','reports.export','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','reports.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','system.settings','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','users.activate','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','users.archive_driver','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','users.create','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','users.edit','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','users.manage_admins','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','users.manage_permissions','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','users.restore_driver','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','users.suspend','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permission_templates (role,permission_key,is_allowed,created_at) VALUES ('super_admin','users.view','t','2026-03-17 12:47:47.905873+00') ON CONFLICT DO NOTHING;
-- ---- placeholders / out-of-band production columns ----
-- Placeholders for production policies that pre-date the repository chain
-- (created out-of-band in production; migration 20261111070035 ALTERs them).
-- Command type matches production; roles/predicates are fully redefined by
-- the migration, so the placeholder predicate never survives.
CREATE POLICY "Anon can read app_settings" ON public.app_settings AS PERMISSIVE FOR SELECT TO anon USING (false);
CREATE POLICY "Authenticated users can read app_settings" ON public.app_settings AS PERMISSIVE FOR SELECT TO authenticated USING (false);
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS client_id uuid;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
