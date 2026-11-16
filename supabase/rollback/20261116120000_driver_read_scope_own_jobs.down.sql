-- Rollback for 20261116120000_driver_read_scope_own_jobs.sql
-- Restores the org-wide read policies on jobs, inspections, damage_items,
-- photos and evidence_items exactly as they were before. The three helper
-- functions (current_driver_profile_id, driver_can_read_job_evidence,
-- driver_can_read_inspection_evidence) are left in place: nothing references
-- them once these policies are restored, and dropping them is not required.
BEGIN;

DROP POLICY IF EXISTS "jobs_select_org" ON public.jobs;
CREATE POLICY "jobs_select_org" ON public.jobs FOR SELECT TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id()));

DROP POLICY IF EXISTS "inspections_select_scoped" ON public.inspections;
DROP POLICY IF EXISTS "inspections_insert_org" ON public.inspections;
DROP POLICY IF EXISTS "inspections_update_org" ON public.inspections;
DROP POLICY IF EXISTS "inspections_delete_org" ON public.inspections;
DROP POLICY IF EXISTS "Org members can manage inspections" ON public.inspections;
CREATE POLICY "Org members can manage inspections" ON public.inspections FOR ALL TO public
  USING (is_super_admin() OR (org_id = user_org_id()))
  WITH CHECK (is_super_admin() OR (org_id = user_org_id()));

DROP POLICY IF EXISTS "damage_items_select_scoped" ON public.damage_items;
DROP POLICY IF EXISTS "damage_items_insert_org" ON public.damage_items;
DROP POLICY IF EXISTS "damage_items_update_org" ON public.damage_items;
DROP POLICY IF EXISTS "damage_items_delete_org" ON public.damage_items;
DROP POLICY IF EXISTS "Org members can manage damage_items" ON public.damage_items;
CREATE POLICY "Org members can manage damage_items" ON public.damage_items FOR ALL TO public
  USING (is_super_admin() OR (org_id = user_org_id()))
  WITH CHECK (is_super_admin() OR (org_id = user_org_id()));

DROP POLICY IF EXISTS "photos_select_org" ON public.photos;
CREATE POLICY "photos_select_org" ON public.photos FOR SELECT TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id()));

DROP POLICY IF EXISTS "evidence_items_select_org" ON public.evidence_items;
CREATE POLICY "evidence_items_select_org" ON public.evidence_items FOR SELECT TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id()));

COMMIT;
