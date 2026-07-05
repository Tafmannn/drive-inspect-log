-- =====================================================================
-- ROLLBACK for 20260630100100_phase1_jobs_write_scope_admin_only
-- =====================================================================
-- Restores the single permissive FOR ALL policy on public.jobs.
-- WARNING: this re-opens raw-API INSERT/DELETE of jobs to any authenticated
-- org member (including drivers). Use only to revert a bad deploy.
-- =====================================================================

DROP POLICY IF EXISTS "jobs_select_org"   ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_org"   ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_admin" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_admin" ON public.jobs;

CREATE POLICY "Org members can manage jobs"
  ON public.jobs FOR ALL TO authenticated
  USING (org_id = public.user_org_id())
  WITH CHECK (org_id = public.user_org_id());
