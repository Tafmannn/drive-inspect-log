# 01 — Architecture (Admin / Super Admin)

Audit date: 2026-11-16 · Branch: `claude/vehicle-app-security-review-czk39t` · Supabase `lynkvfduzqdyvlzgriyh`

## Source of truth

| Layer | Where | How a role is decided |
|---|---|---|
| Role storage | `public.user_profiles.role` (`driver` / `admin` / `super_admin` / `client`) + `account_status` (`pending_activation` / `active` / `suspended`) | Single row per auth user. A trigger (`guard_user_profile_privileged_columns`) blocks non-super-admins from writing `role`, `org_id`, `client_id` or `is_protected`. |
| Frontend | `src/context/AuthContext.tsx` → `src/lib/roleModel.ts` | Reads `user_profiles.role` (never JWT metadata). `rolesForProfileRole()` expands it: super_admin → SUPERADMIN+ADMIN+DRIVER; admin → ADMIN+DRIVER; client → CLIENT. |
| Route guards | `App.tsx` `ProtectedRoute` / `AdminRoute` / `SuperAdminRoute`, `ControlRoute`, `PortalRoute` | `isAdmin` (admin or super admin), `isSuperAdmin`, plus account-status gate. |
| Navigation | `features/control/config/navigation.ts` + `useControlNavigation` | `requiredRoles` evaluated with `roleSatisfies()` (inheritance). |
| Edge functions | `_shared/auth.ts` `authenticateCaller()` → `_shared/profileAuthz.ts` | Verifies the JWT (getClaims), then loads `user_profiles` with the service role. `isAdmin` = admin or super_admin. `inactiveAccountError()` refuses non-active accounts. |
| Database | RLS helpers `is_admin_or_super_admin()`, `is_super_admin()`, `user_org_id()`; 67 policies use them | Role from `user_profiles`; tenant scope by `org_id = user_org_id()`; super admin is unscoped. |
| Permission catalogue | `permissions_catalog`, `role_permission_templates`, `user_permission_overrides`, `user_has_permission()` | Role templates plus per-user overrides. **Not used by any RLS policy, edge function or UI check** (F-04). |

## Role hierarchy (enforced)

```
SUPERADMIN ⊇ ADMIN ⊇ DRIVER        CLIENT (portal) — isolated, inherits nothing
```

* **Admin scope:** own org (`org_id = user_org_id()`).
* **Super admin scope:** all orgs, plus owner-only capabilities: organisations, audit/error logs, `app_settings`, the super-admin role, protected accounts, sensitive permission overrides and profile sync.

## Screens (current)

There are three admin shells over largely shared data:
* `/control/*`: Command Centre, the primary operations UI, used by admin and super admin.
* `/admin/*`: legacy admin pages, several of which duplicate `/control`.
* `/super-admin/*`: the owner console.

See 04-ux-review.md.

## Target design (adopted: Option A, unified)

* One operations UI (`/control`) used by Admin and Super Admin. Super Admin gets an extra **Platform** nav group; it never gets a separate, reduced copy of an operations screen.
* Shared components carry the super-admin extras behind `isSuperAdmin`. For example, `UserManagementPanel` is now used by `/control/admin`, `/admin/users` and `/super-admin/users`.
* Roles expand in one place (`roleModel.ts`, mirrored by `profileAuthz.rolesArrayFor`, with a parity test).
* Enforcement is server-side: RLS helpers and edge functions both require an **active** account. The edge-function half is done on this branch; the RLS half is pending approval (F-03).
* Capability contract: `ADMIN_CAPABILITIES ⊆ capabilitiesFor(super_admin)`, tested. Owner-only capabilities are listed separately.

Option B (separate Operations and Platform workspaces) was rejected. The owner is the only super admin and runs operations day to day, so a workspace switch adds a step and invites the duplicate-screen drift that caused the reported defect.
