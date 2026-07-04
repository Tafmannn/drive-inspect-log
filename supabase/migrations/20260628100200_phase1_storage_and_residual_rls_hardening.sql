-- =====================================================================
-- Phase 1 / H1 + C5 (safe subset): storage + residual-RLS hardening
-- =====================================================================
-- Scope of THIS migration (validated as non-breaking):
--   * H1: org-scope the expense-receipts storage bucket (was readable by ANY
--         authenticated user across all orgs).
--   * C5: lock down sheet_sync_config / sheet_sync_logs (USING(true)) to admins,
--         ONLY where those tables exist. On databases where the Google-Sheets
--         sync was never provisioned, the block is skipped and the tables are
--         NOT created.
--   * Bonus: restrict app_settings WRITES to admins (was world-writable);
--         reads remain open so feature-flag reads keep working.
--
-- Fully idempotent: every new policy is dropped-if-exists before creation, so
-- this file is safe to re-run after a partial failure.
--
-- DELIBERATELY NOT INCLUDED (shipped separately in later Phase-1 migrations):
--   * qr_confirmations hardening → 20260630100200 (SECURITY DEFINER RPCs).
--   * vehicle-photos bucket lockdown → 20260630100000.
-- =====================================================================

-- ---------------------------------------------------------------------
-- H1) expense-receipts storage: org-scoped. Receipt paths are
--     '<expenseId>/<uuid>.<ext>', so the owning org is expenses.org_id.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can read expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_select_org" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "expense_receipts_delete_org" ON storage.objects;

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
--
-- These Google-Sheets-sync tables do not exist in every environment (the sync
-- was retired before they were created in some databases). `DROP POLICY IF
-- EXISTS ... ON <table>` still errors when the TABLE is absent (IF EXISTS only
-- guards the policy, not the relation), so guard the whole block on the table
-- actually existing. No-op where the tables were never created — and the tables
-- are never created here.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.sheet_sync_config') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can manage sheet sync config" ON public.sheet_sync_config;
    DROP POLICY IF EXISTS "sheet_sync_config_admin_all" ON public.sheet_sync_config;
    CREATE POLICY "sheet_sync_config_admin_all"
    ON public.sheet_sync_config FOR ALL TO authenticated
    USING (public.is_admin_or_super_admin())
    WITH CHECK (public.is_admin_or_super_admin());
  END IF;

  IF to_regclass('public.sheet_sync_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can view sync logs" ON public.sheet_sync_logs;
    DROP POLICY IF EXISTS "System can insert sync logs" ON public.sheet_sync_logs;
    DROP POLICY IF EXISTS "sheet_sync_logs_admin_select" ON public.sheet_sync_logs;
    DROP POLICY IF EXISTS "sheet_sync_logs_admin_insert" ON public.sheet_sync_logs;
    CREATE POLICY "sheet_sync_logs_admin_select"
    ON public.sheet_sync_logs FOR SELECT TO authenticated
    USING (public.is_admin_or_super_admin());
    CREATE POLICY "sheet_sync_logs_admin_insert"
    ON public.sheet_sync_logs FOR INSERT TO authenticated
    WITH CHECK (public.is_admin_or_super_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- app_settings: reads stay open (feature flags); writes admin-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all for anon on app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_select_all" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_write_admin" ON public.app_settings;
CREATE POLICY "app_settings_select_all"
ON public.app_settings FOR SELECT
USING (true);
CREATE POLICY "app_settings_write_admin"
ON public.app_settings FOR ALL TO authenticated
USING (public.is_admin_or_super_admin())
WITH CHECK (public.is_admin_or_super_admin());
