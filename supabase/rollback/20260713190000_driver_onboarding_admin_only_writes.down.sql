-- Rollback for 20260713190000_driver_onboarding_admin_only_writes.sql
-- Restores the original (permissive) policies exactly as created in
-- 20260317100818_70ff590d-f760-4447-aa95-4d39a4271233.sql.

DROP POLICY IF EXISTS "driver_onboarding_select" ON public.driver_onboarding;
DROP POLICY IF EXISTS "driver_onboarding_insert_admin" ON public.driver_onboarding;
DROP POLICY IF EXISTS "driver_onboarding_update_admin" ON public.driver_onboarding;
DROP POLICY IF EXISTS "driver_onboarding_delete_admin" ON public.driver_onboarding;

CREATE POLICY "Org members can manage onboarding"
  ON public.driver_onboarding FOR ALL
  USING (is_super_admin() OR org_id = user_org_id())
  WITH CHECK (is_super_admin() OR org_id = user_org_id());

DROP POLICY IF EXISTS "onboarding_docs_select_org" ON storage.objects;
DROP POLICY IF EXISTS "onboarding_docs_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "onboarding_docs_update_org" ON storage.objects;
DROP POLICY IF EXISTS "onboarding_docs_delete_org" ON storage.objects;

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
