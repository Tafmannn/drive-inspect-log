

Plan already approved above. Proceeding to execution in default mode — no changes to scope.

**Execution order:**
1. Migration: `DROP TABLE sheet_sync_config, sheet_sync_logs, sync_errors`
2. Delete: `google-sheets-sync` edge fn (+ config.toml block), `sheetSyncApi.ts`, `safePushToSheet.ts`, `GoogleSheetsPanel.tsx`, `SyncErrors.tsx`
3. Strip sheet refs from `App.tsx`, `InspectionFlow.tsx`, `featureFlags.ts`, dashboards, nav configs
4. Refactor `BottomNav.tsx` to role-aware (admin: Dashboard / Jobs / Control / Profile)
5. Build `src/features/exports/` with Jobs/Inspections/Expenses CSV + JSON backup, mount at `/control/exports`, add sidebar entry
6. Audit guards (`ControlRoute`, `AdminRoute`, `AuthContext`) for fail-open paths; gate `DevRoleBanner` to DEV
7. Parallelize sequential queries in `useAdminDashboardData`, `useAdminJobQueues`; add `staleTime`
8. Self-QA: grep for sheet refs, verify routes, confirm typecheck

