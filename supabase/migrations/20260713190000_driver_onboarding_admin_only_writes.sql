-- =====================================================================
-- SECURITY-001: driver_onboarding writes must be admin-only
-- =====================================================================
-- DEFECT: "Org members can manage onboarding" (20260317100818) is a single
--   FOR ALL policy scoped only by org_id = user_org_id() — it applies to
--   SELECT *and* INSERT/UPDATE/DELETE alike. Every write path in the app
--   (createOnboarding/updateOnboarding/reviewOnboarding in
--   src/lib/onboardingApi.ts) is only ever called from AdminOnboarding.tsx,
--   an admin-only route — but nothing at the database layer enforces that.
--   Any authenticated driver in the org could call
--   supabase.from('driver_onboarding').update({ status: 'approved',
--   reviewed_by: <self>, reviewed_at: now() }) directly and self-approve
--   their own compliance record (licence/right-to-work/document review),
--   bypassing the entire admin review workflow this feature exists to
--   enforce — the same class of gap as WORKFLOW-006 (client gates
--   correctly, server had no matching check), but in raw table RLS rather
--   than an RPC.
--
-- FIX: split the single FOR ALL policy into:
--   - SELECT: admins/super-admins see all org records (needed for the
--     admin review queue); a driver may also see their OWN record, matched
--     by linked_user_id or (pre-link) by email — this is the exact lookup
--     useDriverGate() already performs client-side to gate driver access,
--     so read access for "my own record" must remain.
--   - INSERT/UPDATE/DELETE: admin/super-admin only, org-scoped for admins.
-- No existing legitimate call path is affected — every write already only
-- ever originates from the admin-only page.
-- =====================================================================

DROP POLICY IF EXISTS "Org members can manage onboarding" ON public.driver_onboarding;

CREATE POLICY "driver_onboarding_select"
  ON public.driver_onboarding FOR SELECT
  USING (
    public.is_super_admin()
    OR (org_id = public.user_org_id() AND public.is_admin_or_super_admin())
    OR linked_user_id = auth.uid()
    OR (email IS NOT NULL AND email = (auth.jwt() ->> 'email'))
  );

CREATE POLICY "driver_onboarding_insert_admin"
  ON public.driver_onboarding FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (org_id = public.user_org_id() AND public.is_admin_or_super_admin())
  );

CREATE POLICY "driver_onboarding_update_admin"
  ON public.driver_onboarding FOR UPDATE
  USING (
    public.is_super_admin()
    OR (org_id = public.user_org_id() AND public.is_admin_or_super_admin())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (org_id = public.user_org_id() AND public.is_admin_or_super_admin())
  );

CREATE POLICY "driver_onboarding_delete_admin"
  ON public.driver_onboarding FOR DELETE
  USING (
    public.is_super_admin()
    OR (org_id = public.user_org_id() AND public.is_admin_or_super_admin())
  );

-- =====================================================================
-- onboarding-docs bucket: was NOT org-scoped at all (`auth.role() =
-- 'authenticated'` only) — any authenticated user in ANY org could
-- view/upload/overwrite/delete any other org's driver licence scans,
-- proof-of-address, right-to-work documents, etc. The storage path
-- (`<onboardingId>/<docType>.<ext>`) has no org prefix to key off, so the
-- fix joins through driver_onboarding.id (first path segment) to resolve
-- the owning org, mirroring the pod-photos/pod-pdfs org-scoped pattern.
-- =====================================================================

DROP POLICY IF EXISTS "Org members can view onboarding docs" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload onboarding docs" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update onboarding docs" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete onboarding docs" ON storage.objects;

CREATE POLICY "onboarding_docs_select_org"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'onboarding-docs'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.driver_onboarding d
        WHERE d.id::text = split_part(storage.objects.name, '/', 1)
          AND d.org_id = public.user_org_id()
          AND public.is_admin_or_super_admin()
      )
    )
  );

CREATE POLICY "onboarding_docs_insert_org"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'onboarding-docs'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.driver_onboarding d
        WHERE d.id::text = split_part(storage.objects.name, '/', 1)
          AND d.org_id = public.user_org_id()
          AND public.is_admin_or_super_admin()
      )
    )
  );

CREATE POLICY "onboarding_docs_update_org"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'onboarding-docs'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.driver_onboarding d
        WHERE d.id::text = split_part(storage.objects.name, '/', 1)
          AND d.org_id = public.user_org_id()
          AND public.is_admin_or_super_admin()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'onboarding-docs'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.driver_onboarding d
        WHERE d.id::text = split_part(storage.objects.name, '/', 1)
          AND d.org_id = public.user_org_id()
          AND public.is_admin_or_super_admin()
      )
    )
  );

CREATE POLICY "onboarding_docs_delete_org"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'onboarding-docs'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.driver_onboarding d
        WHERE d.id::text = split_part(storage.objects.name, '/', 1)
          AND d.org_id = public.user_org_id()
          AND public.is_admin_or_super_admin()
      )
    )
  );
