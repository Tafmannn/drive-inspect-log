-- Allow drivers to insert their own driver_profiles row during onboarding wizard.
-- Admins/super_admins remain able to insert for any user in their org.
DROP POLICY IF EXISTS driver_profiles_insert_admin_super ON public.driver_profiles;

CREATE POLICY driver_profiles_insert_self_admin_super
ON public.driver_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid())
  OR is_super_admin()
  OR (is_admin_or_super_admin() AND (org_id = user_org_id()))
);