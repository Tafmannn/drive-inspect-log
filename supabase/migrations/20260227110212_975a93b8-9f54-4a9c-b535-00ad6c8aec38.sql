-- Add route calculation fields to jobs table
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS route_distance_miles numeric NULL,
  ADD COLUMN IF NOT EXISTS route_eta_minutes integer NULL,
  ADD COLUMN IF NOT EXISTS maps_validated boolean NOT NULL DEFAULT false;

-- Add feature flags to app_settings
INSERT INTO public.app_settings (key, value)
VALUES 
  ('MAPS_ENABLED', '"true"'::jsonb),
  ('CLOUD_STORAGE_ENABLED', '"false"'::jsonb),
  ('VISION_AI_ENABLED', '"false"'::jsonb)
ON CONFLICT (key) DO NOTHING;