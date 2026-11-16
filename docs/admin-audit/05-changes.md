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
