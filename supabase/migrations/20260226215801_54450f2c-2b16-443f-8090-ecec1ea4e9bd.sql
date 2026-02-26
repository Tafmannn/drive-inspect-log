
-- QR handover confirmations
CREATE TABLE IF NOT EXISTS public.qr_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('collection', 'delivery')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '48 hours'),
  confirmed_at timestamp with time zone,
  customer_name text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon on qr_confirmations"
  ON public.qr_confirmations
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- App settings key-value store for ETA flags etc
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon on app_settings"
  ON public.app_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Seed default settings
INSERT INTO public.app_settings (key, value) VALUES
  ('eta_notifications_enabled', 'false'::jsonb),
  ('auth_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Add ETA notification flags to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS notify_customer_on_start boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_customer_on_arrival boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_customer_on_complete boolean NOT NULL DEFAULT false;
