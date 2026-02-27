
-- ─── Add new columns to jobs table for Job Master integration ───────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS sheet_job_id text,
  ADD COLUMN IF NOT EXISTS job_date date,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS job_type text DEFAULT 'Single',
  ADD COLUMN IF NOT EXISTS job_source text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_notes text,
  ADD COLUMN IF NOT EXISTS pickup_time_from text,
  ADD COLUMN IF NOT EXISTS pickup_time_to text,
  ADD COLUMN IF NOT EXISTS pickup_access_notes text,
  ADD COLUMN IF NOT EXISTS delivery_time_from text,
  ADD COLUMN IF NOT EXISTS delivery_time_to text,
  ADD COLUMN IF NOT EXISTS delivery_access_notes text,
  ADD COLUMN IF NOT EXISTS promise_by_time text,
  ADD COLUMN IF NOT EXISTS vehicle_type text,
  ADD COLUMN IF NOT EXISTS vehicle_fuel_type text,
  ADD COLUMN IF NOT EXISTS distance_miles numeric,
  ADD COLUMN IF NOT EXISTS rate_per_mile numeric,
  ADD COLUMN IF NOT EXISTS total_price numeric,
  ADD COLUMN IF NOT EXISTS caz_ulez_flag text,
  ADD COLUMN IF NOT EXISTS caz_ulez_cost numeric,
  ADD COLUMN IF NOT EXISTS other_expenses numeric,
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS driver_external_id text,
  ADD COLUMN IF NOT EXISTS job_notes text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS sync_to_map boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sheet_row_index integer;

-- Index for sheet sync lookups
CREATE INDEX IF NOT EXISTS idx_jobs_sheet_job_id ON public.jobs(sheet_job_id);

-- ─── Create sync_errors table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sheet_row_index integer NOT NULL,
  sheet_job_id text,
  missing_fields text[] NOT NULL DEFAULT '{}',
  error_message text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon on sync_errors"
  ON public.sync_errors FOR ALL
  USING (true)
  WITH CHECK (true);
