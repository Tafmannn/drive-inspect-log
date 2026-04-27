
-- Pricing snapshots: advisory pricing audit trail
CREATE TABLE IF NOT EXISTS public.pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  job_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  suggested_price numeric,
  applied_price numeric,
  confidence text,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_final_invoice_price boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'admin_accept'
);

CREATE INDEX IF NOT EXISTS idx_pricing_snapshots_job_id ON public.pricing_snapshots(job_id);
CREATE INDEX IF NOT EXISTS idx_pricing_snapshots_org_id ON public.pricing_snapshots(org_id);

ALTER TABLE public.pricing_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view pricing_snapshots"
  ON public.pricing_snapshots
  FOR SELECT
  TO authenticated
  USING (is_super_admin() OR org_id = user_org_id());

CREATE POLICY "Admins can insert pricing_snapshots"
  ON public.pricing_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (is_super_admin() OR (is_admin_or_super_admin() AND org_id = user_org_id()))
  );

-- Add pricing metadata columns to jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pricing_metadata jsonb,
  ADD COLUMN IF NOT EXISTS pricing_suggestion_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS pricing_suggestion_used_by uuid;

-- Seed default pricing_defaults in app_settings
INSERT INTO public.app_settings (key, value)
VALUES ('pricing_defaults', jsonb_build_object(
  'MIN_CHARGE', 50,
  'MIN_RATE_PER_MILE', 1.2,
  'WAITING_RATE_PER_HOUR', 25,
  'WAITING_FREE_MINUTES', 15,
  'URGENCY_MULTIPLIERS', jsonb_build_object('standard', 1.0, 'same_day', 1.15, 'urgent', 1.3),
  'SHORT_BAND_MAX', 25,
  'LONG_BAND_MIN', 200,
  'MIN_MARGIN_FRACTION', 0.15
))
ON CONFLICT (key) DO NOTHING;
