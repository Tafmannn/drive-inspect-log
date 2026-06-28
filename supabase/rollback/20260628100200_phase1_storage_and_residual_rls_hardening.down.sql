-- Rollback for 20260628100200_phase1_storage_and_residual_rls_hardening
-- Restores the previous (permissive) policies.

-- expense-receipts: back to bucket-only
DROP POLICY IF EXISTS "expense_receipts_select_org" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_delete_org" ON storage.objects;

CREATE POLICY "Users can upload expense receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts');
CREATE POLICY "Users can read expense receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts');
CREATE POLICY "Users can delete expense receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts');

-- sheet_sync_config
DROP POLICY IF EXISTS "sheet_sync_config_admin_all" ON public.sheet_sync_config;
CREATE POLICY "Admins can manage sheet sync config"
  ON public.sheet_sync_config FOR ALL USING (true);

-- sheet_sync_logs
DROP POLICY IF EXISTS "sheet_sync_logs_admin_select" ON public.sheet_sync_logs;
DROP POLICY IF EXISTS "sheet_sync_logs_admin_insert" ON public.sheet_sync_logs;
CREATE POLICY "Admins can view sync logs"
  ON public.sheet_sync_logs FOR SELECT USING (true);
CREATE POLICY "System can insert sync logs"
  ON public.sheet_sync_logs FOR INSERT WITH CHECK (true);

-- app_settings
DROP POLICY IF EXISTS "app_settings_select_all" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_write_admin" ON public.app_settings;
CREATE POLICY "Allow all for anon on app_settings"
  ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
