# 05 — Changes

All changes are on branch `claude/vehicle-app-security-review-czk39t`. **Not merged, not deployed, no production database changes.**

## Frontend (takes effect on merge + deploy)

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

## Edge functions (take effect only when deployed: **awaiting approval**)

| Function | Change | Finding |
|---|---|---|
| `_shared/profileAuthz.ts`, `_shared/auth.ts` | `inactiveAccountError()` | F-05 |
| `user-lifecycle` | Active-only callers; non-super can't act on a super_admin target (5 actions) | F-05, F-06 |
| `assign-driver`, `get-org-users`, `send-push`, `portal-access` | Active-only callers | F-05 |
| `send-invoice-email` | Active-only callers (previously no status check) | F-05 |

Deploy list (each with its `_shared` files): user-lifecycle, assign-driver, get-org-users, send-push, portal-access, send-invoice-email.

## Database: **awaiting approval**

* `docs/admin-audit/pending/20261117120000_active_only_admin_helpers.sql`. Kept out of `supabase/migrations/` so nothing can apply it automatically. Once approved, move it there and apply. Verification probes are in 06-tests.md.

## Tests added or updated

* New: `role-model.test.ts`, `admin-superadmin-parity.test.tsx`, `edge-admin-active-gate.test.ts`.
* Updated:
  * `domain.test.ts`: ADMIN now implies DRIVER, consistent with the server.
  * `admin-api-user-lifecycle.test.ts`: removed tests for deleted helpers.
