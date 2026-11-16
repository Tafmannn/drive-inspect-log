# 03 — Findings

| ID | Severity | Status | Summary |
|---|---|---|---|
| F-01 | P1 | Fixed (frontend; deploy pending) | Super Admin console's user management was a reduced duplicate; owner could change fewer driver settings than an Admin |
| F-02 | P2 | Fixed | Super Admin's role list lacked ADMIN; `roles.includes("ADMIN")` checks (nav) excluded the owner |
| F-03 | P0 | Migration prepared, awaiting approval | RLS role helpers ignore `account_status` |
| F-04 | P1 | Mitigated (honest UI); enforcement on roadmap | Per-user permission overrides are stored but never enforced |
| F-05 | P1 | Fixed in code; deploy awaiting approval | Admin edge functions accepted pending (and, for invoices, any-status) callers |
| F-06 | P2 | Fixed in code; deploy awaiting approval | Owner protection relied only on the `is_protected` flag |
| F-07 | P3 | Fixed | Misleading labels: "Organisation Settings" opened the admin dashboard; owner Settings said auth source was `app_metadata.role` |
| F-08 | P3 | Risk, documented | `user_org_id()` falls back to the oldest org for a super admin with no org |
| F-09 | P2 | Roadmap | Three parallel admin shells with duplicate pages |

## F-01: Reported defect (Driver Settings: Admin can, Super Admin can't)

* **Evidence:**
  * Every "Users" entry in the Super Admin console (`SuperAdminDashboard.tsx`, three tiles; `SuperAdminSettings` "Manage users") routed to `/super-admin/users`.
  * That page (`SuperAdminPages.tsx` `SuperAdminUsers`, about 200 lines) offered only a role dropdown and an active/inactive toggle.
  * Admins reach `/control/admin`, which uses `UserIndex` + `UserDetailEditor` + `PermissionEditor`: name, phone, notes, the full **driver profile** (licence number and expiry, DOB, employment type, trade plate, address, emergency contact, notes), activate, resend invite, suspend/reactivate, **archive/restore driver** and permission overrides.
* **Backend was not the cause:**
  * `user-lifecycle` gives super admin a superset (`callerIsSuper` bypasses org scope).
  * RLS read and write probes show Super Admin ≥ Admin on every table and policy.
  * Role templates: admin ⊆ super.
* **Root cause:** duplicated, diverged screens. The owner was routed into the weaker copy.
* **Fix:**
  * New `UserManagementPanel` is the single surface, used by `/control/admin`, `/admin/users` and `/super-admin/users`.
  * The duplicate page and its now-dead `adminApi` helpers (create/setRole/deactivate/reactivate) were removed.
* **Tests:** `admin-superadmin-parity.test.tsx`.
* **Also fixed by the same change:**
  * The old page treated `pending_activation` users as active, so "Deactivate" was offered on pending users.
  * It had no resend-invite action.

## F-02: Inheritance not explicit in the role list

* **Problem:**
  * `AuthContext` appended only `SUPERADMIN` to the baseline `DRIVER`.
  * `hasRoleCheck` special-cased SUPERADMIN, but `useControlNavigation` used `user.roles.includes(r)`, so any item with `requiredRoles: ["ADMIN"]` would hide from the owner.
  * Latent: the current nav config gates only the Platform group.
* **Fix:**
  * `src/lib/roleModel.ts` (`rolesForProfileRole`, `roleSatisfies`); AuthContext and nav use it.
  * The expansion is the same as the server's `rolesArrayFor`, with a parity test.
  * A portal role list (CLIENT) can never satisfy a staff role, even if combined.

## F-03: RLS helpers ignore account status (security)

* **Problem:** `is_admin_or_super_admin()` and `is_super_admin()` check only `role`. They back 67 policies, and 0 of those policies check `account_status`.
* **Impact:** a suspended admin keeps admin data access via direct REST calls for the life of an already-issued access token (about an hour). Suspension bans the auth user, so refresh stops.
  * A `pending_activation` admin has admin RLS power from the moment they sign in.
* **Fix prepared:** `docs/admin-audit/pending/20261117120000_active_only_admin_helpers.sql`. It requires `account_status = 'active'` in both helpers, and makes `user_has_permission()` grant the super admin everything.
* **Approval:** production RLS change, awaiting approval.
* **Rollback:** re-create the helpers without the `account_status` predicate.

## F-04: Permission overrides are not enforced

* **Problem:**
  * `user_has_permission` / `current_user_has_permission` are referenced by 0 RLS policies, 0 edge functions and 0 UI checks; their only caller is `can_actor_manage_permission`.
  * The Permissions editor lets admins "deny" keys, and 25 overrides exist (all on drivers, all redundant with the driver role), but none change access.
* **Mitigation:** the editor now states that overrides are recorded but access is set by role.
* **Proper fix (roadmap R-03):** either enforce selected keys server-side or remove the feature.

## F-05: Edge functions accepted non-active callers

* **Problem:**
  * `user-lifecycle`, `assign-driver`, `get-org-users`, `send-push` and `portal-access` refused only `suspended`.
  * `send-invoice-email` checked no status.
  * The UI blocks pending accounts, but direct calls did not.
* **Fix:** shared `inactiveAccountError()` in `_shared/profileAuthz.ts`, applied to all six.
* **Test:** a source-scan test fails if any admin-gated function stops applying it.

## F-06: Owner protection relied on a flag

* **Problem:** the `user-lifecycle` actions `update_profile`, `set_role`, `activate`, `suspend` and `reactivate` protected the super admin only via `is_protected`, which is true for the current owner. A second super_admin without the flag could be demoted or suspended by an admin.
* **Fix:** a non-super caller can never act on a `super_admin` target. Tested by source scan.

## F-07: Misleading labels

* "Organisation Settings" on `/control/admin` opened `/admin`, the admin dashboard. It is now labelled "Admin dashboard", and the owner also gets "Organisations".
* The owner Settings page said the auth source is `app_metadata.role`; it is `user_profiles.role`.

## F-08: `user_org_id()` fallback (risk)

* **Problem:** for a super admin with `org_id IS NULL`, the function returns the oldest organisation, so org-scoped writes would silently target it.
* **Current state:** the owner's profile has an org set, so this is inactive.
* **Recommendation:** return NULL instead and rely on the policies' explicit `is_super_admin()` branch. Re-run the RLS probe first.

## F-09: Duplicate admin shells

* `/admin/*` and `/control/*` both provide jobs queue, POD review, finance, drivers and dashboard.
* `/super-admin/jobs` is a read-only jobs list.
* Divergence between copies is how F-01 happened. See 04-ux-review.md and roadmap R-01.
