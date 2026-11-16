-- Rollback for 20261116140000_driver_scope_finance_and_evidence_storage.sql
-- Restores the previous org-wide policies exactly as they were. The helper
-- functions (driver_owns_job, driver_can_access_expense, expense_is_invoiced,
-- driver_can_use_job_path) are left in place: nothing references them once
-- these policies are restored.
BEGIN;

-- invoices / invoice_items / invoice_expenses
DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id()));

DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
CREATE POLICY "invoice_items_select" ON public.invoice_items FOR SELECT TO authenticated
  USING (is_super_admin() OR (EXISTS (SELECT 1 FROM invoices i
    WHERE ((i.id = invoice_items.invoice_id) AND (i.org_id = user_org_id())))));

DROP POLICY IF EXISTS "invoice_expenses_select" ON public.invoice_expenses;
CREATE POLICY "invoice_expenses_select" ON public.invoice_expenses FOR SELECT TO authenticated
  USING (is_super_admin() OR (EXISTS (SELECT 1 FROM invoices i
    WHERE ((i.id = invoice_expenses.invoice_id) AND (i.org_id = user_org_id())))));

-- pricing_snapshots / clients
DROP POLICY IF EXISTS "pricing_snapshots_select_admin" ON public.pricing_snapshots;
DROP POLICY IF EXISTS "Org members can view pricing_snapshots" ON public.pricing_snapshots;
CREATE POLICY "Org members can view pricing_snapshots" ON public.pricing_snapshots FOR SELECT TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id()));

DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id()));

-- expenses
DROP POLICY IF EXISTS "expenses_select_scoped" ON public.expenses;
DROP POLICY IF EXISTS "expenses_insert_scoped" ON public.expenses;
DROP POLICY IF EXISTS "expenses_update_scoped" ON public.expenses;
DROP POLICY IF EXISTS "expenses_delete_scoped" ON public.expenses;
DROP POLICY IF EXISTS "Org members can manage expenses" ON public.expenses;
CREATE POLICY "Org members can manage expenses" ON public.expenses FOR ALL TO public
  USING (is_super_admin() OR (org_id = user_org_id()))
  WITH CHECK (is_super_admin() OR (org_id = user_org_id()));

-- expense_receipts
DROP POLICY IF EXISTS "expense_receipts_select_scoped" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_insert_scoped" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_update_scoped" ON public.expense_receipts;
DROP POLICY IF EXISTS "expense_receipts_delete_scoped" ON public.expense_receipts;
DROP POLICY IF EXISTS "Org members can manage expense_receipts" ON public.expense_receipts;
CREATE POLICY "Org members can manage expense_receipts" ON public.expense_receipts FOR ALL TO public
  USING (is_super_admin() OR (EXISTS (SELECT 1 FROM expenses e
    WHERE ((e.id = expense_receipts.expense_id) AND (e.org_id = user_org_id())))))
  WITH CHECK (is_super_admin() OR (EXISTS (SELECT 1 FROM expenses e
    WHERE ((e.id = expense_receipts.expense_id) AND (e.org_id = user_org_id())))));

-- storage: invoice-pdfs
DROP POLICY IF EXISTS "invoice_pdfs_select_org" ON storage.objects;
CREATE POLICY "invoice_pdfs_select_org" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'invoice-pdfs'::text) AND (is_super_admin() OR (split_part(name, '/'::text, 1) = (user_org_id())::text)));
DROP POLICY IF EXISTS "invoice_pdfs_insert_org" ON storage.objects;
CREATE POLICY "invoice_pdfs_insert_org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'invoice-pdfs'::text) AND (is_super_admin() OR (split_part(name, '/'::text, 1) = (user_org_id())::text)));
DROP POLICY IF EXISTS "invoice_pdfs_update_org" ON storage.objects;
CREATE POLICY "invoice_pdfs_update_org" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'invoice-pdfs'::text) AND (is_super_admin() OR (split_part(name, '/'::text, 1) = (user_org_id())::text)))
  WITH CHECK ((bucket_id = 'invoice-pdfs'::text) AND (is_super_admin() OR (split_part(name, '/'::text, 1) = (user_org_id())::text)));
DROP POLICY IF EXISTS "invoice_pdfs_delete_org" ON storage.objects;
CREATE POLICY "invoice_pdfs_delete_org" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'invoice-pdfs'::text) AND (is_super_admin() OR (split_part(name, '/'::text, 1) = (user_org_id())::text)));

-- storage: expense-receipts
DROP POLICY IF EXISTS "expense_receipts_select_org" ON storage.objects;
CREATE POLICY "expense_receipts_select_org" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'expense-receipts'::text) AND (is_super_admin() OR (EXISTS (SELECT 1 FROM expenses e
    WHERE (((e.id)::text = split_part(objects.name, '/'::text, 1)) AND (e.org_id = user_org_id()))))));
DROP POLICY IF EXISTS "expense_receipts_insert_org" ON storage.objects;
CREATE POLICY "expense_receipts_insert_org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'expense-receipts'::text) AND (is_super_admin() OR (EXISTS (SELECT 1 FROM expenses e
    WHERE (((e.id)::text = split_part(objects.name, '/'::text, 1)) AND (e.org_id = user_org_id()))))));
DROP POLICY IF EXISTS "expense_receipts_delete_org" ON storage.objects;
CREATE POLICY "expense_receipts_delete_org" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'expense-receipts'::text) AND (is_super_admin() OR (EXISTS (SELECT 1 FROM expenses e
    WHERE (((e.id)::text = split_part(objects.name, '/'::text, 1)) AND (e.org_id = user_org_id()))))));

-- storage: vehicle-photos
DROP POLICY IF EXISTS "vehicle_photos_select_org" ON storage.objects;
CREATE POLICY "vehicle_photos_select_org" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'vehicle-photos'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))
    OR (EXISTS (SELECT 1 FROM expenses e WHERE ((e.org_id = user_org_id()) AND (objects.name ~~ (('expense-receipts/'::text || (e.id)::text) || '/%'::text)))))));
DROP POLICY IF EXISTS "vehicle_photos_insert_org" ON storage.objects;
CREATE POLICY "vehicle_photos_insert_org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'vehicle-photos'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))));
DROP POLICY IF EXISTS "vehicle_photos_update_org" ON storage.objects;
CREATE POLICY "vehicle_photos_update_org" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'vehicle-photos'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))))
  WITH CHECK ((bucket_id = 'vehicle-photos'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))));
DROP POLICY IF EXISTS "vehicle_photos_delete_org" ON storage.objects;
CREATE POLICY "vehicle_photos_delete_org" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'vehicle-photos'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))));

-- storage: vehicle-signatures
DROP POLICY IF EXISTS "Authenticated users can read org signatures" ON storage.objects;
CREATE POLICY "Authenticated users can read org signatures" ON storage.objects FOR SELECT TO authenticated
  USING ((bucket_id = 'vehicle-signatures'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))));
DROP POLICY IF EXISTS "vehicle_signatures_insert_org" ON storage.objects;
CREATE POLICY "vehicle_signatures_insert_org" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'vehicle-signatures'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))));
DROP POLICY IF EXISTS "vehicle_signatures_update_org" ON storage.objects;
CREATE POLICY "vehicle_signatures_update_org" ON storage.objects FOR UPDATE TO authenticated
  USING ((bucket_id = 'vehicle-signatures'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))))
  WITH CHECK ((bucket_id = 'vehicle-signatures'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))));
DROP POLICY IF EXISTS "vehicle_signatures_delete_org" ON storage.objects;
CREATE POLICY "vehicle_signatures_delete_org" ON storage.objects FOR DELETE TO authenticated
  USING ((bucket_id = 'vehicle-signatures'::text) AND (is_super_admin()
    OR (EXISTS (SELECT 1 FROM jobs j WHERE ((j.org_id = user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))));

COMMIT;
