-- Axentra vehicle catalogue artwork: one studio render per make/model/year range/colour.
-- Shared across all tenants (no tenant data). Read by signed-in users, written by super admins only.

create extension if not exists btree_gist with schema extensions;

create table public.vehicle_catalogue_images (
  id uuid primary key default gen_random_uuid(),
  make text not null check (length(trim(make)) > 0),
  model text not null check (length(trim(model)) > 0),
  year_from int not null check (year_from between 1900 and 2100),
  year_to int not null check (year_to between 1900 and 2100),
  colour text not null check (length(trim(colour)) > 0),
  body_type text,
  generation text,
  image_path text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint vehicle_catalogue_images_year_order check (year_from <= year_to),
  -- one image per make/model/colour for any given year: ranges may not overlap
  constraint vehicle_catalogue_images_no_overlap exclude using gist (
    lower(make) with =,
    lower(model) with =,
    lower(colour) with =,
    int4range(year_from, year_to, '[]') with &&
  )
);

create index vehicle_catalogue_images_lookup_idx
  on public.vehicle_catalogue_images (lower(make), lower(model), year_from, year_to);

alter table public.vehicle_catalogue_images enable row level security;

create policy "catalogue images readable by signed-in users"
  on public.vehicle_catalogue_images for select to authenticated using (true);
create policy "catalogue images insert by super admin"
  on public.vehicle_catalogue_images for insert to authenticated with check (public.is_super_admin());
create policy "catalogue images update by super admin"
  on public.vehicle_catalogue_images for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "catalogue images delete by super admin"
  on public.vehicle_catalogue_images for delete to authenticated using (public.is_super_admin());

revoke all on public.vehicle_catalogue_images from anon;

-- Replaced by the resolver-backed version in 20261121170100_job_catalogue_image_matching.sql
create or replace function public.get_vehicle_catalogue_image(
  p_make text, p_model text, p_year int, p_colour text default null
) returns text
language sql stable security invoker set search_path = public
as $$
  select image_path
  from public.vehicle_catalogue_images
  where lower(make) = lower(trim(p_make))
    and lower(model) = lower(trim(p_model))
    and p_year between year_from and year_to
  order by (lower(colour) = lower(trim(coalesce(p_colour, '')))) desc, created_at
  limit 1
$$;
revoke execute on function public.get_vehicle_catalogue_image(text, text, int, text) from anon, public;
grant execute on function public.get_vehicle_catalogue_image(text, text, int, text) to authenticated;

-- Public bucket for shared catalogue artwork (no tenant data)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-images', 'vehicle-images', true, 10485760, array['image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "vehicle-images super admin read"
  on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-images' and public.is_super_admin());
create policy "vehicle-images super admin insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-images' and public.is_super_admin());
create policy "vehicle-images super admin update"
  on storage.objects for update to authenticated
  using (bucket_id = 'vehicle-images' and public.is_super_admin())
  with check (bucket_id = 'vehicle-images' and public.is_super_admin());
create policy "vehicle-images super admin delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-images' and public.is_super_admin());
