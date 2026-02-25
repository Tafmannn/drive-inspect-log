
-- JOBS
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  external_job_number text,
  vehicle_reg text not null,
  vehicle_make text not null,
  vehicle_model text not null,
  vehicle_colour text not null,
  vehicle_year text,
  pickup_contact_name text not null,
  pickup_contact_phone text not null,
  pickup_company text,
  pickup_address_line1 text not null,
  pickup_address_line2 text,
  pickup_city text not null,
  pickup_postcode text not null,
  pickup_notes text,
  delivery_contact_name text not null,
  delivery_contact_phone text not null,
  delivery_company text,
  delivery_address_line1 text not null,
  delivery_address_line2 text,
  delivery_city text not null,
  delivery_postcode text not null,
  delivery_notes text,
  earliest_delivery_date date,
  status text not null default 'ready_for_pickup',
  has_pickup_inspection boolean not null default false,
  has_delivery_inspection boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_completed_at_idx on public.jobs(completed_at);

-- INSPECTIONS
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  type text not null check (type in ('pickup', 'delivery')),
  odometer integer,
  fuel_level_percent integer check (fuel_level_percent between 0 and 100),
  vehicle_condition text,
  light_condition text,
  oil_level_status text,
  water_level_status text,
  notes text,
  handbook text,
  service_book text,
  mot text,
  v5 text,
  parcel_shelf text,
  spare_wheel_status text,
  tool_kit text,
  tyre_inflation_kit text,
  locking_wheel_nut text,
  sat_nav_working text,
  alloys_or_trims text,
  alloys_damaged text,
  wheel_trims_damaged text,
  number_of_keys text,
  ev_charging_cables text,
  aerial text,
  customer_paperwork text,
  has_damage boolean not null default false,
  inspected_at timestamptz,
  inspected_by_name text,
  driver_signature_url text,
  customer_signature_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspections_unique_job_type unique (job_id, type)
);

create index if not exists inspections_job_id_idx on public.inspections(job_id);

-- DAMAGE ITEMS
create table if not exists public.damage_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  x numeric,
  y numeric,
  area text,
  location text,
  item text,
  damage_types text[],
  notes text,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists damage_items_inspection_id_idx on public.damage_items(inspection_id);

-- PHOTOS
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete set null,
  type text not null,
  url text not null,
  thumbnail_url text,
  backend text not null default 'internal',
  backend_ref text,
  created_at timestamptz not null default now()
);

create index if not exists photos_job_id_idx on public.photos(job_id);
create index if not exists photos_inspection_id_idx on public.photos(inspection_id);

-- JOB ACTIVITY LOG
create table if not exists public.job_activity_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists job_activity_log_job_id_idx on public.job_activity_log(job_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inspections_updated_at BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: enable but allow all for anon (auth disabled for now)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon on jobs" ON public.jobs FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon on inspections" ON public.inspections FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.damage_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon on damage_items" ON public.damage_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon on photos" ON public.photos FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.job_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon on job_activity_log" ON public.job_activity_log FOR ALL USING (true) WITH CHECK (true);

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-photos', 'vehicle-photos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('vehicle-signatures', 'vehicle-signatures', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow all for anon
CREATE POLICY "Allow public read vehicle-photos" ON storage.objects FOR SELECT USING (bucket_id = 'vehicle-photos');
CREATE POLICY "Allow public upload vehicle-photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vehicle-photos');
CREATE POLICY "Allow public update vehicle-photos" ON storage.objects FOR UPDATE USING (bucket_id = 'vehicle-photos');
CREATE POLICY "Allow public delete vehicle-photos" ON storage.objects FOR DELETE USING (bucket_id = 'vehicle-photos');

CREATE POLICY "Allow public read vehicle-signatures" ON storage.objects FOR SELECT USING (bucket_id = 'vehicle-signatures');
CREATE POLICY "Allow public upload vehicle-signatures" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vehicle-signatures');
CREATE POLICY "Allow public update vehicle-signatures" ON storage.objects FOR UPDATE USING (bucket_id = 'vehicle-signatures');
CREATE POLICY "Allow public delete vehicle-signatures" ON storage.objects FOR DELETE USING (bucket_id = 'vehicle-signatures');
