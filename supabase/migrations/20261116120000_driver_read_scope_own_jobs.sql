-- Driver read scope: own jobs only, and no POD evidence once a job is completed.
--
-- Before this migration every authenticated user in an org could SELECT every
-- job, inspection, photo, damage item and evidence item in that org. The app
-- filtered to the driver's own jobs on screen, but the data itself was
-- readable (e.g. a driver could read 73 jobs, 1 of them their own).
--
-- After:
--   * Admins / super-admins: unchanged (org-wide / global).
--   * Drivers: jobs rows only where they are the assigned driver (this still
--     includes completed jobs, so the "Last 14 Days" list keeps working).
--   * Drivers: inspections, photos, damage_items, evidence_items only for
--     their own jobs that are NOT completed (i.e. no POD once approved).
--
-- Write policies are left exactly as they were; only read access narrows.
-- The FOR ALL policies on inspections/damage_items are split so the write
-- side keeps its existing expression.

-- ── Helpers (SECURITY DEFINER to avoid RLS recursion through jobs) ──────────

CREATE OR REPLACE FUNCTION public.current_driver_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT dp.id FROM public.driver_profiles dp WHERE dp.user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.driver_can_read_job_evidence(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.driver_profiles dp ON dp.id = j.driver_id
    WHERE j.id = p_job_id
      AND dp.user_id = auth.uid()
      AND j.status <> 'completed'
  )
$$;

-- damage_items has no job_id; resolve the job through its inspection.
CREATE OR REPLACE FUNCTION public.driver_can_read_inspection_evidence(p_inspection_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.inspections i
    WHERE i.id = p_inspection_id
      AND public.driver_can_read_job_evidence(i.job_id)
  )
$$;

REVOKE ALL ON FUNCTION public.current_driver_profile_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_can_read_inspection_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_can_read_inspection_evidence(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.driver_can_read_job_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_driver_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_can_read_job_evidence(uuid) TO authenticated;

-- ── jobs ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "jobs_select_org" ON public.jobs;
CREATE POLICY "jobs_select_org" ON public.jobs
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      org_id = user_org_id()
      AND (
        is_admin_or_super_admin()
        OR driver_id = current_driver_profile_id()
      )
    )
  );

-- ── inspections ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Org members can manage inspections" ON public.inspections;

CREATE POLICY "inspections_select_scoped" ON public.inspections
  FOR SELECT TO public
  USING (
    is_super_admin()
    OR (org_id = user_org_id() AND (is_admin_or_super_admin() OR driver_can_read_job_evidence(job_id)))
  );
CREATE POLICY "inspections_insert_org" ON public.inspections
  FOR INSERT TO public
  WITH CHECK (is_super_admin() OR (org_id = user_org_id()));
CREATE POLICY "inspections_update_org" ON public.inspections
  FOR UPDATE TO public
  USING (is_super_admin() OR (org_id = user_org_id()))
  WITH CHECK (is_super_admin() OR (org_id = user_org_id()));
CREATE POLICY "inspections_delete_org" ON public.inspections
  FOR DELETE TO public
  USING (is_super_admin() OR (org_id = user_org_id()));

-- ── damage_items ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Org members can manage damage_items" ON public.damage_items;

CREATE POLICY "damage_items_select_scoped" ON public.damage_items
  FOR SELECT TO public
  USING (
    is_super_admin()
    OR (org_id = user_org_id() AND (is_admin_or_super_admin() OR driver_can_read_inspection_evidence(inspection_id)))
  );
CREATE POLICY "damage_items_insert_org" ON public.damage_items
  FOR INSERT TO public
  WITH CHECK (is_super_admin() OR (org_id = user_org_id()));
CREATE POLICY "damage_items_update_org" ON public.damage_items
  FOR UPDATE TO public
  USING (is_super_admin() OR (org_id = user_org_id()))
  WITH CHECK (is_super_admin() OR (org_id = user_org_id()));
CREATE POLICY "damage_items_delete_org" ON public.damage_items
  FOR DELETE TO public
  USING (is_super_admin() OR (org_id = user_org_id()));

-- ── photos ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "photos_select_org" ON public.photos;
CREATE POLICY "photos_select_org" ON public.photos
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (org_id = user_org_id() AND (is_admin_or_super_admin() OR driver_can_read_job_evidence(job_id)))
  );

-- ── evidence_items ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "evidence_items_select_org" ON public.evidence_items;
CREATE POLICY "evidence_items_select_org" ON public.evidence_items
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (org_id = user_org_id() AND (is_admin_or_super_admin() OR driver_can_read_job_evidence(job_id)))
  );
