# 05 — Changes

Developed on branch `claude/vehicle-app-security-review-czk39t`. Released on 2026-11-16 with approval, in this order: edge functions, then database, then app.

## Frontend (released with the merge)

| File | Change | Finding |
|---|---|---|
| `src/lib/roleModel.ts` (new) | Role expansion, `roleSatisfies` (inheritance, CLIENT isolated), capability tiers | F-02 |
| `src/context/AuthContext.tsx` | Uses `rolesForProfileRole`; `hasRoleCheck` → `roleSatisfies` | F-02 |
| `src/features/control/hooks/useControlNavigation.ts` | `requiredRoles` evaluated with inheritance | F-02 |
| `src/features/users/components/UserManagementPanel.tsx` (new) | Single user-management surface | F-01 |
| `src/pages/SuperAdminPages.tsx` | `SuperAdminUsers` → shared panel (−200 lines); auth-source label corrected | F-01, F-07 |
| `src/pages/AdminUsers.tsx`, `src/features/control/pages/ControlAdmin.tsx` | Use shared panel; "Admin dashboard" label; owner "Organisations" link | F-01, F-07 |
| `src/features/users/components/PermissionEditor.tsx` | Notice: overrides recorded, not enforced | F-04 |
| `src/lib/adminApi.ts` | Removed dead duplicate user-action helpers | F-01 |

## Edge functions (deployed 2026-11-16)

| Function | Change | Finding |
|---|---|---|
| `_shared/profileAuthz.ts`, `_shared/auth.ts` | `inactiveAccountError()` | F-05 |
| `user-lifecycle` | Active-only callers; non-super can't act on a super_admin target (5 actions) | F-05, F-06 |
| `assign-driver`, `get-org-users`, `send-push`, `portal-access` | Active-only callers | F-05 |
| `send-invoice-email` | Active-only callers (previously no status check) | F-05 |

Deployed with their full `_shared` files and unchanged `verify_jwt`: user-lifecycle v57, assign-driver v78, get-org-users v77 (`verify_jwt` false), send-push v3, send-invoice-email v3 (`verify_jwt` true), portal-access v2 (false).

## Database (applied 2026-11-16)

* `supabase/migrations/20261116212409_active_only_admin_helpers.sql`: active-only `is_admin_or_super_admin()` and `is_super_admin()`; the super admin holds every permission in `user_has_permission()`. Function privileges and `SECURITY DEFINER` settings are unchanged.

## Tests added or updated

* New: `role-model.test.ts`, `admin-superadmin-parity.test.tsx`, `edge-admin-active-gate.test.ts`.
* Updated:
  * `domain.test.ts`: ADMIN now implies DRIVER, consistent with the server.
  * `admin-api-user-lifecycle.test.ts`: removed tests for deleted helpers.

## Follow-up release (2026-11-16, later)

| Change | Where |
|---|---|
| Low-light warning: each captured standard photo is measured; below mean brightness 45/255 the driver gets a toast and the tile shows "Too dark — retake". Warns only, never blocks. | `src/lib/capturedPhoto.ts`, `src/pages/InspectionFlow.tsx` |
| User-management buttons, inputs and selects are 44 px on mobile, compact from `sm` up | `src/features/users/components/*` |
| Owner **Feature switches** card (Super Admin → Settings): per-flag save with rollback on failure, confirmation for the two risky flags, "takes effect within 5 minutes" notice. Writes rely on the existing super-admin-only RLS. | `src/features/platform/FeatureFlagsCard.tsx`, `src/lib/featureFlags.ts` |
| Break-glass recovery guide | `docs/admin-audit/08-break-glass.md` |
| **Database, applied later the same day** (`20261116222659`): `user_org_id()` no longer falls back to the oldest org; every `app_settings` change by a signed-in user is written to `admin_audit_log`; the audit function can't be called directly | `supabase/migrations/20261116222659_org_fallback_and_settings_audit.sql` |

## Merged admin screens (2026-11-17)

One `/control` screen per area replaces each mobile/desktop pair (F-09, R-01). No database or edge-function change.

| File | Change |
|---|---|
| `src/features/control/pages/ControlJobs.tsx` | Queues + list views, evidence acknowledgement, run order, URL-synced view and search |
| `src/features/control/pages/jobs/jobsView.ts` (new) | Views, legacy `?filter=`/`?status=` translation, one jobs search rule |
| `src/features/control/pages/jobs/JobsColumns.tsx`, `src/components/AdminJobCard.tsx` | Workflow-health cue in the table; "Mark resolved" and Expense actions |
| `src/features/control/pages/ControlPodReview.tsx`, `pod/podView.ts`, `pod/PodReviewCard.tsx` (new) | Evidence groups, signature cues, union of actions |
| `src/features/control/hooks/useClosureReview.ts` | Joins latest active delivery inspection signatures; `evidenceState`, `buildSignatureMap` |
| `src/features/control/pages/ControlFinance.tsx`, `lib/financeBreakdown.ts` | Expense cards, receipt-compliance KPI, URL filters |
| `src/features/control/pages/ControlDrivers.tsx`, `drivers/DriverCard.tsx` (new), `hooks/useControlDriversData.ts` | Onboarding completion, 60-day performance, driver cards, shared search |
| `src/features/control/components/shared/ResponsiveList.tsx`, `ViewChips.tsx`, `hooks/useIsDesktop.ts` (new) | Cards below 1024 px, table above; scrollable view chips |
| `src/features/control/components/shared/KpiStrip.tsx` | KPI labels wrap to two lines instead of being cut off on phones |
| `src/features/control/LegacyAdminRedirects.tsx`, `legacyAdminTarget.ts` (new), `src/App.tsx` | `/admin/{jobs,pod-review,finance,drivers}` redirect |
| `src/lib/operationsBuckets.ts`, `src/lib/workflowBrain.ts`, `src/pages/AdminDashboard.tsx`, Control pages, `exceptionEngine.ts`, `DriverProfileDetail.tsx` | Links point at the merged views; driver profile Back honours `from=` |
| Removed | `AdminJobsQueue.tsx`, `AdminPodReview.tsx`, `AdminFinance.tsx`, `AdminDrivers.tsx`, `usePodReviewData.ts`, `useAdminDrivers.ts` |

Tests: `merged-admin-screens.test.tsx`, `merged-jobs-pod-pages.test.tsx`, `merged-finance-page.test.tsx`; `control-pages-linking` and `admin-drivers-search` updated.
