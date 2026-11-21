-- Axentra: automatically attach a catalogue vehicle image to each job.
-- Depends on 20261121170000_vehicle_catalogue_images.sql (table, bucket, is_super_admin()).

-- 1. Make aliases (e.g. "VW" -> "Volkswagen")
create table if not exists public.vehicle_make_aliases (
  alias text primary key,           -- stored normalised: lowercase, alphanumerics separated by single spaces
  make text not null,               -- canonical make as used in vehicle_catalogue_images
  created_at timestamptz not null default now()
);
alter table public.vehicle_make_aliases enable row level security;
create policy "make aliases readable by signed-in users"
  on public.vehicle_make_aliases for select to authenticated using (true);
create policy "make aliases managed by super admin"
  on public.vehicle_make_aliases for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.vehicle_make_aliases from anon;

insert into public.vehicle_make_aliases (alias, make) values
  ('mercedes', 'Mercedes-Benz'), ('merc', 'Mercedes-Benz'), ('mb', 'Mercedes-Benz'),
  ('mercedes benz', 'Mercedes-Benz'), ('mercedes amg', 'Mercedes-Benz'),
  ('vw', 'Volkswagen'), ('volkswagen commercial', 'Volkswagen'), ('volkswagen commercial vehicles', 'Volkswagen'),
  ('landrover', 'Land Rover'), ('land rover', 'Land Rover'),
  ('alfa', 'Alfa Romeo'), ('alfa romeo', 'Alfa Romeo'),
  ('citroen', 'Citroen'), ('citroën', 'Citroen'),
  ('skoda', 'Skoda'), ('škoda', 'Skoda'),
  ('bmw', 'BMW'), ('bmw i', 'BMW'),
  ('mini', 'MINI'), ('ds', 'DS'), ('ds automobiles', 'DS'),
  ('vauxhall', 'Vauxhall'), ('opel', 'Vauxhall'),
  ('chevy', 'Chevrolet')
on conflict (alias) do nothing;

-- 2. Column on jobs
alter table public.jobs add column if not exists catalogue_image_path text;

-- 3. Helpers
create or replace function public.vehicle_name_norm(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(trim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9šë]+', ' ', 'g')), '')
$$;

-- Normalised canonical make, with aliases applied ("VW" -> "volkswagen")
create or replace function public.canonical_make(p text)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select public.vehicle_name_norm(a.make) from public.vehicle_make_aliases a
      where a.alias = public.vehicle_name_norm(p)),
    public.vehicle_name_norm(p))
$$;

-- Resolve the best catalogue image for a vehicle. Returns null when nothing matches.
-- Model matching: exact, or job model starting with the catalogue model ("x5 xdrive30d" -> "x5"); longest wins.
create or replace function public.resolve_catalogue_image(
  p_make text, p_model text, p_year text, p_colour text default null
) returns text
language plpgsql stable security invoker set search_path = public as $$
declare
  v_make text := public.vehicle_name_norm(p_make);
  v_model text := public.vehicle_name_norm(p_model);
  v_year int := substring(coalesce(p_year, '') from '(?:19|20)[0-9]{2}')::int;
  v_colour text := public.vehicle_name_norm(p_colour);
begin
  if v_make is null or v_model is null or v_year is null then
    return null;
  end if;
  v_make := public.canonical_make(v_make);

  -- strip a repeated make from the start of the model ("BMW X5" -> "X5")
  if v_model like v_make || ' %' then
    v_model := substr(v_model, length(v_make) + 2);
  end if;

  return (
    select c.image_path
    from public.vehicle_catalogue_images c
    where public.vehicle_name_norm(c.make) = v_make
      and v_year between c.year_from and c.year_to
      and (v_model = public.vehicle_name_norm(c.model)
           or v_model like public.vehicle_name_norm(c.model) || ' %')
    order by length(public.vehicle_name_norm(c.model)) desc,
             (public.vehicle_name_norm(c.colour) = v_colour) desc,
             c.created_at
    limit 1
  );
end $$;

-- Keep the earlier lookup function consistent with the resolver
create or replace function public.get_vehicle_catalogue_image(
  p_make text, p_model text, p_year int, p_colour text default null
) returns text
language sql stable security invoker set search_path = public as $$
  select public.resolve_catalogue_image(p_make, p_model, p_year::text, p_colour)
$$;

revoke execute on function public.canonical_make(text) from anon, public;
grant execute on function public.canonical_make(text) to authenticated, service_role;
revoke execute on function public.vehicle_name_norm(text) from anon, public;
revoke execute on function public.resolve_catalogue_image(text, text, text, text) from anon, public;
grant execute on function public.vehicle_name_norm(text) to authenticated, service_role;
grant execute on function public.resolve_catalogue_image(text, text, text, text) to authenticated, service_role;

-- 4. Trigger on jobs. Named zz_ so it runs after update_jobs_updated_at (triggers fire alphabetically):
--    during a catalogue backfill it restores updated_at so old jobs don't look recently edited.
create or replace function public.jobs_set_catalogue_image()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or new.vehicle_make is distinct from old.vehicle_make
     or new.vehicle_model is distinct from old.vehicle_model
     or new.vehicle_year is distinct from old.vehicle_year
     or new.vehicle_colour is distinct from old.vehicle_colour
     or current_setting('axentra.catalogue_backfill', true) = 'on' then
    new.catalogue_image_path := public.resolve_catalogue_image(
      new.vehicle_make, new.vehicle_model, new.vehicle_year, new.vehicle_colour);
  end if;
  if tg_op = 'UPDATE' and current_setting('axentra.catalogue_backfill', true) = 'on' then
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;
revoke execute on function public.jobs_set_catalogue_image() from anon, authenticated, public;

drop trigger if exists zz_jobs_catalogue_image on public.jobs;
create trigger zz_jobs_catalogue_image
  before insert or update on public.jobs
  for each row execute function public.jobs_set_catalogue_image();

-- 5. When catalogue images or aliases change, re-resolve affected jobs
create or replace function public.catalogue_refresh_jobs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('axentra.catalogue_backfill', 'on', true);
  if tg_table_name = 'vehicle_catalogue_images' then
    -- re-check every job of the affected make(s), plus any job pointing at the old image,
    -- so a new, better (longer model / matching colour) or removed image is reflected
    update public.jobs j set catalogue_image_path = catalogue_image_path
    where public.canonical_make(j.vehicle_make) = any (array[
            case when tg_op <> 'INSERT' then public.canonical_make(old.make) end,
            case when tg_op <> 'DELETE' then public.canonical_make(new.make) end])
       or (tg_op <> 'INSERT' and j.catalogue_image_path = old.image_path);
  else
    update public.jobs j set catalogue_image_path = catalogue_image_path
    where j.catalogue_image_path is null;
  end if;
  perform set_config('axentra.catalogue_backfill', 'off', true);
  return null;
end $$;
revoke execute on function public.catalogue_refresh_jobs() from anon, authenticated, public;

drop trigger if exists catalogue_images_refresh_jobs on public.vehicle_catalogue_images;
create trigger catalogue_images_refresh_jobs
  after insert or update or delete on public.vehicle_catalogue_images
  for each row execute function public.catalogue_refresh_jobs();

drop trigger if exists make_aliases_refresh_jobs on public.vehicle_make_aliases;
create trigger make_aliases_refresh_jobs
  after insert or update on public.vehicle_make_aliases
  for each statement execute function public.catalogue_refresh_jobs();

-- 6. One-off backfill of existing jobs
select set_config('axentra.catalogue_backfill', 'on', true);
update public.jobs set catalogue_image_path = catalogue_image_path;
select set_config('axentra.catalogue_backfill', 'off', true);
