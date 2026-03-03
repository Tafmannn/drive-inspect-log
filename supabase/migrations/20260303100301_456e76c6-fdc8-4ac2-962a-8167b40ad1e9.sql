
-- ============================================================
-- AXENTRA ENTERPRISE UPGRADE: Multi-Tenant Organisations
-- ============================================================

-- 1. Create organisations table
CREATE TABLE public.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- Seed initial org
INSERT INTO public.organisations (id, name) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Axentra Vehicles'
);

-- RLS: authenticated users can read their org
CREATE POLICY "Users can read their organisation"
  ON public.organisations FOR SELECT TO authenticated
  USING (id::text = (auth.jwt()->>'org_id'));

-- Anon fallback for dev mode
CREATE POLICY "Anon can read organisations"
  ON public.organisations FOR SELECT TO anon
  USING (true);

-- 2. Add org_id to domain tables and backfill
ALTER TABLE public.jobs ADD COLUMN org_id uuid REFERENCES public.organisations(id);
UPDATE public.jobs SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE public.jobs ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX idx_jobs_org_id ON public.jobs(org_id);

ALTER TABLE public.inspections ADD COLUMN org_id uuid REFERENCES public.organisations(id);
UPDATE public.inspections SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE public.inspections ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX idx_inspections_org_id ON public.inspections(org_id);

ALTER TABLE public.damage_items ADD COLUMN org_id uuid REFERENCES public.organisations(id);
UPDATE public.damage_items SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE public.damage_items ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX idx_damage_items_org_id ON public.damage_items(org_id);

ALTER TABLE public.photos ADD COLUMN org_id uuid REFERENCES public.organisations(id);
UPDATE public.photos SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE public.photos ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX idx_photos_org_id ON public.photos(org_id);

ALTER TABLE public.expenses ADD COLUMN org_id uuid REFERENCES public.organisations(id);
UPDATE public.expenses SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE public.expenses ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX idx_expenses_org_id ON public.expenses(org_id);

ALTER TABLE public.job_activity_log ADD COLUMN org_id uuid REFERENCES public.organisations(id);
UPDATE public.job_activity_log SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE public.job_activity_log ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX idx_job_activity_log_org_id ON public.job_activity_log(org_id);

-- 3. Create helper function for org-scoped access (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt()->>'org_id')::uuid
$$;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.jwt()->>'role'
$$;

-- 4. Update RLS policies for multi-tenant access
-- Keep existing anon policies for backward compat, add authenticated org-scoped ones

-- Jobs
CREATE POLICY "Org members can manage jobs"
  ON public.jobs FOR ALL TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());

-- Inspections
CREATE POLICY "Org members can manage inspections"
  ON public.inspections FOR ALL TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());

-- Damage items
CREATE POLICY "Org members can manage damage_items"
  ON public.damage_items FOR ALL TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());

-- Photos
CREATE POLICY "Org members can manage photos"
  ON public.photos FOR ALL TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());

-- Expenses
CREATE POLICY "Org members can manage expenses"
  ON public.expenses FOR ALL TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());

-- Job activity log
CREATE POLICY "Org members can manage job_activity_log"
  ON public.job_activity_log FOR ALL TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());

-- Expense receipts (scoped through expense join)
CREATE POLICY "Org members can manage expense_receipts"
  ON public.expense_receipts FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.org_id = public.user_org_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.org_id = public.user_org_id()
  ));
