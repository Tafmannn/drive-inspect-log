-- Super-admin helper based on JWT claims (email + metadata roles)
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) = any (array[
      'axentravehiclelogistics@gmail.com',
      'info@axentravehicles.com'
    ])
    or lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', '')) in ('super_admin', 'superadmin')
    or exists (
      select 1
      from jsonb_array_elements_text(coalesce(auth.jwt() -> 'user_metadata' -> 'roles', '[]'::jsonb)) as r(role)
      where upper(r.role) in ('SUPERADMIN', 'SUPER_ADMIN')
    )
    or exists (
      select 1
      from jsonb_array_elements_text(coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb)) as r(role)
      where upper(r.role) in ('SUPERADMIN', 'SUPER_ADMIN')
    );
$$;

-- Org resolver that supports metadata claims and super-admin fallback org
create or replace function public.user_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'org_id', '')::uuid,
    nullif(auth.jwt() -> 'user_metadata' ->> 'org_id', '')::uuid,
    nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid,
    case
      when public.is_super_admin() then (
        select id
        from public.organisations
        order by created_at asc
        limit 1
      )
      else null
    end
  );
$$;

-- Role resolver that supports metadata roles and super-admin override
create or replace function public.user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_super_admin() then 'super_admin'
    else coalesce(
      nullif(lower(auth.jwt() -> 'user_metadata' ->> 'role'), ''),
      nullif(lower(auth.jwt() -> 'app_metadata' ->> 'role'), ''),
      case
        when exists (
          select 1
          from jsonb_array_elements_text(coalesce(auth.jwt() -> 'user_metadata' -> 'roles', '[]'::jsonb)) as r(role)
          where upper(r.role) in ('ADMIN', 'SUPERADMIN', 'SUPER_ADMIN')
        ) then 'admin'
        else null
      end,
      case
        when exists (
          select 1
          from jsonb_array_elements_text(coalesce(auth.jwt() -> 'user_metadata' -> 'roles', '[]'::jsonb)) as r(role)
          where upper(r.role) = 'DRIVER'
        ) then 'driver'
        else null
      end,
      nullif(lower(auth.jwt() ->> 'role'), ''),
      'authenticated'
    )
  end;
$$;

-- RLS alignment: allow super_admin to bypass org scoping

drop policy if exists "Org members can manage jobs" on public.jobs;
create policy "Org members can manage jobs"
on public.jobs
for all
using (public.is_super_admin() or org_id = public.user_org_id())
with check (public.is_super_admin() or org_id = public.user_org_id());

drop policy if exists "Org members can manage inspections" on public.inspections;
create policy "Org members can manage inspections"
on public.inspections
for all
using (public.is_super_admin() or org_id = public.user_org_id())
with check (public.is_super_admin() or org_id = public.user_org_id());

drop policy if exists "Org members can manage damage_items" on public.damage_items;
create policy "Org members can manage damage_items"
on public.damage_items
for all
using (public.is_super_admin() or org_id = public.user_org_id())
with check (public.is_super_admin() or org_id = public.user_org_id());

drop policy if exists "Org members can manage photos" on public.photos;
create policy "Org members can manage photos"
on public.photos
for all
using (public.is_super_admin() or org_id = public.user_org_id())
with check (public.is_super_admin() or org_id = public.user_org_id());

drop policy if exists "Org members can manage expenses" on public.expenses;
create policy "Org members can manage expenses"
on public.expenses
for all
using (public.is_super_admin() or org_id = public.user_org_id())
with check (public.is_super_admin() or org_id = public.user_org_id());

drop policy if exists "Org members can manage expense_receipts" on public.expense_receipts;
create policy "Org members can manage expense_receipts"
on public.expense_receipts
for all
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.expenses e
    where e.id = expense_receipts.expense_id
      and e.org_id = public.user_org_id()
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.expenses e
    where e.id = expense_receipts.expense_id
      and e.org_id = public.user_org_id()
  )
);

drop policy if exists "Org members can manage job_activity_log" on public.job_activity_log;
create policy "Org members can manage job_activity_log"
on public.job_activity_log
for all
using (public.is_super_admin() or org_id = public.user_org_id())
with check (public.is_super_admin() or org_id = public.user_org_id());