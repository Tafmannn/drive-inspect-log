-- Rollback for 20260713200000_clients_invoice_items_admin_only_writes.sql
-- Restores the original (permissive) policies exactly as created in
-- 20260323222553_305fe413-9ef0-4ec1-b62c-0ca569685c3f.sql.

DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_admin" ON public.clients;
DROP POLICY IF EXISTS "clients_update_admin" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_admin" ON public.clients;

CREATE POLICY "Org members can manage clients"
  ON public.clients FOR ALL
  TO authenticated
  USING (is_super_admin() OR org_id = user_org_id())
  WITH CHECK (is_super_admin() OR org_id = user_org_id());

DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_insert_admin" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_update_admin" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_delete_admin" ON public.invoice_items;

CREATE POLICY "Org members can manage invoice_items"
  ON public.invoice_items FOR ALL
  TO authenticated
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id()
    )
  )
  WITH CHECK (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id()
    )
  );
