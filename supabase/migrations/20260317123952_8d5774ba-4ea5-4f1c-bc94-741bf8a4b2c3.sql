
-- =========================================================
-- 1) CHECK CONSTRAINTS
-- =========================================================
DO $$ BEGIN
  ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check
    CHECK (role in ('driver', 'admin', 'super_admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_account_status_check
    CHECK (account_status in ('pending_activation', 'active', 'suspended'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================
-- 2) UPDATED_AT TRIGGER
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

-- =========================================================
-- 3) HELPER FUNCTIONS (all defined before policies)
-- =========================================================

create or replace function public.is_admin_or_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('admin', 'super_admin')
  )
$$;

create or replace function public.same_org_as_target(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
      or exists (
        select 1
        from public.user_profiles me
        where me.auth_user_id = auth.uid()
          and me.org_id = target_org_id
          and me.role in ('admin', 'super_admin')
      )
$$;

-- Update is_super_admin to check user_profiles with JWT fallback
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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

-- Update user_role to prefer user_profiles
create or replace function public.user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
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

-- Update user_org_id to prefer user_profiles
create or replace function public.user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
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

-- Update user_account_status
create or replace function public.user_account_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select account_status from public.user_profiles where auth_user_id = auth.uid()),
    'active'
  )
$$;

-- =========================================================
-- 4) ACTIVE DRIVER VIEW
-- =========================================================
create or replace view public.active_driver_profiles as
select dp.*
from public.driver_profiles dp
join public.user_profiles up
  on up.auth_user_id = dp.user_id
where coalesce(dp.is_active, true) = true
  and dp.archived_at is null
  and up.role = 'driver'
  and up.account_status = 'active';

-- =========================================================
-- 5) INDEXES
-- =========================================================
create index if not exists idx_user_profiles_org_role_status
  on public.user_profiles(org_id, role, account_status);

create index if not exists idx_driver_profiles_user_id
  on public.driver_profiles(user_id);

create index if not exists idx_driver_profiles_archived_at
  on public.driver_profiles(archived_at);

create index if not exists idx_driver_profiles_is_active_archived
  on public.driver_profiles(is_active, archived_at);

create index if not exists idx_admin_audit_log_target_user_id
  on public.admin_audit_log(target_user_id);

create index if not exists idx_admin_audit_log_target_org_id
  on public.admin_audit_log(target_org_id);

create index if not exists idx_admin_audit_log_created_at
  on public.admin_audit_log(created_at desc);

-- =========================================================
-- 6) RLS — Drop ALL existing policies, then recreate
-- =========================================================

-- user_profiles: drop old policies
drop policy if exists "Admins manage own org user_profiles" on public.user_profiles;
drop policy if exists "Super admins manage all user_profiles" on public.user_profiles;
drop policy if exists "Users can read own user_profile" on public.user_profiles;
drop policy if exists "user_profiles_select_self_admin_super" on public.user_profiles;
drop policy if exists "user_profiles_update_self_admin_super" on public.user_profiles;
drop policy if exists "user_profiles_insert_admin_super" on public.user_profiles;

-- driver_profiles: drop old policies
drop policy if exists "Drivers can manage own profile" on public.driver_profiles;
drop policy if exists "driver_profiles_select_self_admin_super" on public.driver_profiles;
drop policy if exists "driver_profiles_update_admin_super_same_org" on public.driver_profiles;
drop policy if exists "driver_profiles_insert_admin_super" on public.driver_profiles;

-- admin_audit_log: drop old policies
drop policy if exists "Super admins can read audit log" on public.admin_audit_log;
drop policy if exists "admin_audit_log_select_admin_super" on public.admin_audit_log;

-- USER PROFILES SELECT
create policy "user_profiles_select_self_admin_super"
on public.user_profiles
for select
to authenticated
using (
  auth.uid() = auth_user_id
  or public.is_super_admin()
  or (
    public.is_admin_or_super_admin()
    and org_id = user_org_id()
  )
);

-- USER PROFILES UPDATE
create policy "user_profiles_update_self_admin_super"
on public.user_profiles
for update
to authenticated
using (
  auth.uid() = auth_user_id
  or public.is_super_admin()
  or (
    public.is_admin_or_super_admin()
    and org_id = user_org_id()
  )
)
with check (
  auth.uid() = auth_user_id
  or public.is_super_admin()
  or (
    public.is_admin_or_super_admin()
    and org_id = user_org_id()
  )
);

-- USER PROFILES INSERT
create policy "user_profiles_insert_admin_super"
on public.user_profiles
for insert
to authenticated
with check (
  public.is_super_admin()
  or (
    public.is_admin_or_super_admin()
    and org_id = user_org_id()
  )
);

-- DRIVER PROFILES SELECT
create policy "driver_profiles_select_self_admin_super"
on public.driver_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or (
    public.is_admin_or_super_admin()
    and org_id = user_org_id()
  )
);

-- DRIVER PROFILES UPDATE
create policy "driver_profiles_update_admin_super_same_org"
on public.driver_profiles
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_super_admin()
  or (
    public.is_admin_or_super_admin()
    and org_id = user_org_id()
  )
)
with check (
  user_id = auth.uid()
  or public.is_super_admin()
  or (
    public.is_admin_or_super_admin()
    and org_id = user_org_id()
  )
);

-- DRIVER PROFILES INSERT
create policy "driver_profiles_insert_admin_super"
on public.driver_profiles
for insert
to authenticated
with check (
  public.is_super_admin()
  or (
    public.is_admin_or_super_admin()
    and org_id = user_org_id()
  )
);

-- AUDIT LOG SELECT
create policy "admin_audit_log_select_admin_super"
on public.admin_audit_log
for select
to authenticated
using (
  public.is_super_admin()
  or (
    public.is_admin_or_super_admin()
    and target_org_id = user_org_id()
  )
);

-- Revoke direct writes to audit log from authenticated
revoke insert, update, delete on public.admin_audit_log from authenticated;

-- =========================================================
-- 7) STORAGE BUCKET FOR PROFILE PHOTOS
-- =========================================================
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', false)
on conflict (id) do nothing;

drop policy if exists "profile_photos_select_own_org_or_super" on storage.objects;
drop policy if exists "profile_photos_insert_own_org_or_super" on storage.objects;
drop policy if exists "profile_photos_update_own_org_or_super" on storage.objects;
drop policy if exists "profile_photos_delete_own_org_or_super" on storage.objects;

create policy "profile_photos_select_own_org_or_super"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (public.is_super_admin() or split_part(name, '/', 1) = coalesce(user_org_id()::text, ''))
);

create policy "profile_photos_insert_own_org_or_super"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (public.is_super_admin() or split_part(name, '/', 1) = coalesce(user_org_id()::text, ''))
);

create policy "profile_photos_update_own_org_or_super"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (public.is_super_admin() or split_part(name, '/', 1) = coalesce(user_org_id()::text, ''))
)
with check (
  bucket_id = 'profile-photos'
  and (public.is_super_admin() or split_part(name, '/', 1) = coalesce(user_org_id()::text, ''))
);

create policy "profile_photos_delete_own_org_or_super"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (public.is_super_admin() or split_part(name, '/', 1) = coalesce(user_org_id()::text, ''))
);

-- =========================================================
-- 8) SET PROTECTED ACCOUNT
-- =========================================================
update public.user_profiles
set is_protected = true
where lower(email) = 'info@axentravehicles.com';
