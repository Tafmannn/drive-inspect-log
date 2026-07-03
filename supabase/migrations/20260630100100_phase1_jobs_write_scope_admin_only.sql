-- =====================================================================
-- Phase 1 / H2: restrict jobs INSERT + DELETE to admins (defence in depth)
-- =====================================================================
-- DEFECT: "Org members can manage jobs" was FOR ALL TO authenticated, so any
--   authenticated org member (including a plain driver, or a stolen driver
--   token) could INSERT fabricated jobs or DELETE existing jobs directly via
--   the PostgREST API. The admin-only gating in the UI (<AdminRoute>) is
--   cosmetic — it does not constrain the API.
--
-- SCOPE (deliberately minimal + non-breaking):
--   * SELECT + UPDATE stay available to org members. The driver inspection
--     flow REQUIRES this: submit_inspection() is SECURITY INVOKER (runs as the
--     driver) and UPDATEs jobs.status, and InspectionFlow also calls
--     updateJob({status}) directly. Removing driver UPDATE would break pickup/
--     delivery. Column-level protection of price/address fields is a separate,
--     trigger-based follow-up — NOT attempted here.
--   * INSERT + DELETE are restricted to admins/super-admins. Verified safe:
--     the only client job INSERT is createJob() (JobForm, behind <AdminRoute>);
--     there is NO client hard-DELETE of jobs (delete is a soft-delete UPDATE
--     of is_hidden). So no driver-reachable flow inserts or deletes jobs.
--
-- Authority: is_admin_or_super_admin() / user_org_id() read from user_profiles
--   (post Phase-1), so this cannot be bypassed with stale/tampered JWT metadata.
-- Additive/reversible: replaces one FOR ALL policy with four command-scoped ones.
-- =====================================================================

DROP POLICY IF EXISTS "Org members can manage jobs" ON public.jobs;

-- Read: any member of the owning org (drivers see their org's jobs).
CREATE POLICY "jobs_select_org"
ON public.jobs FOR SELECT TO authenticated
USING (public.is_super_admin() OR org_id = public.user_org_id());

-- Update: org members (drivers advance status via submit_inspection/updateJob).
CREATE POLICY "jobs_update_org"
ON public.jobs FOR UPDATE TO authenticated
USING (public.is_super_admin() OR org_id = public.user_org_id())
WITH CHECK (public.is_super_admin() OR org_id = public.user_org_id());

-- Insert: admins/super-admins only, and only into their own org.
CREATE POLICY "jobs_insert_admin"
ON public.jobs FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin_or_super_admin()
  AND (public.is_super_admin() OR org_id = public.user_org_id())
);

-- Delete: admins/super-admins only (client uses soft-delete; this closes the
-- raw-API hard-delete path).
CREATE POLICY "jobs_delete_admin"
ON public.jobs FOR DELETE TO authenticated
USING (
  public.is_admin_or_super_admin()
  AND (public.is_super_admin() OR org_id = public.user_org_id())
);
