-- =====================================================================
-- Phase 1 / H1 + C5 (safe subset): storage + residual-RLS hardening
-- =====================================================================
-- Scope of THIS migration (validated as non-breaking):
--   * H1: org-scope the expense-receipts storage bucket (was readable by ANY
--         authenticated user across all orgs).
--   * C5: lock down sheet_sync_config / sheet_sync_logs (USING(true)) to admins.
--         No client code reads these; the sheets sync runs with the service
--         role, which bypasses RLS, so this does not break syncing.
--   * Bonus: restrict app_settings WRITES to admins (was world-writable);
--         reads remain open so feature-flag reads keep working.
--
-- DELIBERATELY NOT INCLUDED (require client changes / validation — see runbook):
--   * C5 qr_confirmations: USING(true) supports the ANONYMOUS customer handover
--     flow (QrConfirm.tsx reads by token + a job lookup as anon). Locking it
--     safely needs SECURITY DEFINER RPCs + a client change. Reported, not shipped.
--   * C6 vehicle-photos bucket: still referenced as the non-GCS fallback bucket
--     (internalStorageService.ts) and may hold legacy public-URL data. Flipping
--     it private risks breaking historical photo display. Reported, not shipped.
-- =====================================================================

-- ---------------------------------------------------------------------
-- H1) expense-receipts storage: org-scoped. Receipt paths are
--     '<expenseId>/<uuid>.<ext>', so the owning org is expenses.org_id.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete expense receipts" ON storage.objects;

CREATE POLICY "expense_receipts_select_org"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id::text = split_part(storage.objects.name, '/', 1)
        AND e.org_id = public.user_org_id()
    )
  )
);

CREATE POLICY "expense_receipts_insert_org"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id::text = split_part(storage.objects.name, '/', 1)
        AND e.org_id = public.user_org_id()
    )
  )
);

CREATE POLICY "expense_receipts_delete_org"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id::text = split_part(storage.objects.name, '/', 1)
        AND e.org_id = public.user_org_id()
    )
  )
);

-- ---------------------------------------------------------------------
-- C5) sheet_sync_config / sheet_sync_logs: admin-only (was USING(true)).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage sheet sync config" ON public.sheet_sync_config;
CREATE POLICY "sheet_sync_config_admin_all"
ON public.sheet_sync_config FOR ALL TO authenticated
USING (public.is_admin_or_super_admin())
WITH CHECK (public.is_admin_or_super_admin());

DROP POLICY IF EXISTS "Admins can view sync logs" ON public.sheet_sync_logs;
DROP POLICY IF EXISTS "System can insert sync logs" ON public.sheet_sync_logs;
CREATE POLICY "sheet_sync_logs_admin_select"
ON public.sheet_sync_logs FOR SELECT TO authenticated
USING (public.is_admin_or_super_admin());
CREATE POLICY "sheet_sync_logs_admin_insert"
ON public.sheet_sync_logs FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_super_admin());

-- ---------------------------------------------------------------------
-- app_settings: reads stay open (feature flags); writes admin-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for anon on app_settings" ON public.app_settings;
CREATE POLICY "app_settings_select_all"
ON public.app_settings FOR SELECT
USING (true);
CREATE POLICY "app_settings_write_admin"
ON public.app_settings FOR ALL TO authenticated
USING (public.is_admin_or_super_admin())
WITH CHECK (public.is_admin_or_super_admin());
