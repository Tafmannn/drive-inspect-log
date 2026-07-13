-- Rollback for 20260713220000_invoices_admin_only_writes.sql
-- Restores the original permissive FOR ALL policy, using production's
-- canonical name ("Org admins can manage invoices"). Note: staging had
-- diverged and used "Org members can manage invoices" for the identical
-- policy shape prior to this migration — if rolling back on an
-- environment that used that name, recreate under that name instead.

DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
DROP POLICY IF EXISTS "invoices_insert_admin" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_admin" ON public.invoices;
DROP POLICY IF EXISTS "invoices_delete_admin" ON public.invoices;

CREATE POLICY "Org admins can manage invoices"
  ON public.invoices FOR ALL
  TO authenticated
  USING (is_super_admin() OR org_id = user_org_id())
  WITH CHECK (is_super_admin() OR org_id = user_org_id());
