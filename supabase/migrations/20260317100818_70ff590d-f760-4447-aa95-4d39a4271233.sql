
-- Phase 4: Deviation log for out-of-sequence job access
CREATE TABLE public.job_deviation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  driver_id text,
  recommended_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  reason text NOT NULL,
  notes text,
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_deviation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage deviation log"
  ON public.job_deviation_log FOR ALL
  USING (is_super_admin() OR org_id = user_org_id())
  WITH CHECK (is_super_admin() OR org_id = user_org_id());

CREATE INDEX idx_deviation_log_job ON public.job_deviation_log(job_id);
CREATE INDEX idx_deviation_log_org ON public.job_deviation_log(org_id);

-- Phase 5: Driver onboarding workflow
CREATE TABLE public.driver_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  linked_user_id uuid,
  full_name text NOT NULL,
  display_name text,
  phone text,
  email text,
  employment_type text DEFAULT 'contractor',
  trade_plate_number text,
  licence_expiry date,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  headshot_url text,
  licence_front_url text,
  licence_back_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage onboarding"
  ON public.driver_onboarding FOR ALL
  USING (is_super_admin() OR org_id = user_org_id())
  WITH CHECK (is_super_admin() OR org_id = user_org_id());

CREATE INDEX idx_onboarding_org ON public.driver_onboarding(org_id);
CREATE INDEX idx_onboarding_status ON public.driver_onboarding(status);

CREATE TRIGGER update_driver_onboarding_updated_at
  BEFORE UPDATE ON public.driver_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for onboarding documents
INSERT INTO storage.buckets (id, name, public) VALUES ('onboarding-docs', 'onboarding-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Org members can view onboarding docs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'onboarding-docs' AND auth.role() = 'authenticated');

CREATE POLICY "Org members can upload onboarding docs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'onboarding-docs' AND auth.role() = 'authenticated');

CREATE POLICY "Org members can update onboarding docs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'onboarding-docs' AND auth.role() = 'authenticated');

CREATE POLICY "Org members can delete onboarding docs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'onboarding-docs' AND auth.role() = 'authenticated');
