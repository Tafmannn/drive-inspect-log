# 02 — Permission matrix

Legend:
* Status: PASS = verified correct · FAIL = verified defect · RISK = credible, needs follow-up · UNTESTED · N/I = not implemented.
* "FE / EF / DB": frontend guard, edge function check, database RLS or trigger.
* Admin scope = own org. Super Admin scope = all orgs.

## Capability inheritance (automated)

| Check | Evidence | Result |
|---|---|---|
| Admin capabilities ⊆ Super Admin (contract) | `src/test/role-model.test.ts` | PASS |
| Owner-only capabilities absent for Admin | same | PASS |
| Client and server role expansion identical | same (`rolesForProfileRole` vs `rolesArrayFor`) | PASS |
| `role_permission_templates`: every admin-allowed key is super-admin-allowed | live SQL, 27 catalogue keys (21 admin-allowed) | PASS |
| RLS **read**: rows visible to Admin ≤ Super Admin (18 tables) | live rollback-only probe impersonating both real accounts | PASS (super ≥ admin on every table) |
| RLS **write**: rows matching each UPDATE/DELETE/INSERT/ALL policy, Admin ≤ Super Admin | live probe, 50/50 policies evaluated | PASS (0 policies where admin > super) |
| Nav: SUPERADMIN-only role list sees ADMIN-gated items | `admin-superadmin-parity.test.tsx` | PASS (was latent FAIL, F-02) |

## Operations

| Operation | Capability | FE | EF | DB | Admin | Super Admin | Result |
|---|---|---|---|---|---|---|---|
| View/edit user profile | users.edit | AdminRoute/ControlRoute | user-lifecycle `update_profile` (org scope, protected) | RLS user_profiles + guard trigger | own org | all | PASS |
| **Edit driver settings** (licence, employment, address, emergency, notes) | drivers.edit_profile | shared `UserDetailEditor` | `update_driver_profile` whitelist | RLS driver_profiles | own org | all | **FAIL → fixed (F-01)**: the Super Admin console's Users screen had none of these |
| Driver onboarding wizard / profile detail | drivers.onboarding | AdminRoute | — (direct table) | RLS driver_profiles, onboarding_documents | own org | all | PASS |
| Archive / restore driver | drivers.archive_restore | UserDetailEditor | `archive_driver` / `restore_driver` | — | own org | all | PASS (was unreachable from the owner console, F-01) |
| Create / invite user | users.create | CreateUserModal | `create` (admin cannot create super_admin) | guard trigger | own org | all orgs | PASS |
| Resend invite | users.create | UserDetailEditor | `resend_invite` | — | own org | all | PASS (was missing from the owner console, F-01) |
| Activate / suspend / reactivate | users.activate_suspend | UserDetailEditor | lifecycle actions; self-suspend blocked | — | own org, not super_admin | all | PASS; owner guard hardened (F-06) |
| Set role | users.set_role_* | UserDetailEditor | `set_role`: no self-change, no escalation above caller | guard trigger | up to admin | any | PASS |
| Permission overrides | users.permission_overrides_* | PermissionEditor (sensitive keys hidden from admin) | `set_permission_override` | `can_actor_manage_permission` | non-sensitive | all | PASS for storage; **FAIL: not enforced anywhere (F-04)** |
| Assign driver to job | jobs.assign | Control jobs | assign-driver (org scope) | RLS jobs | own org | any org | PASS |
| Jobs CRUD, POD review, finance, invoices, clients, exports | various | AdminRoute/ControlRoute | various | RLS `is_admin_or_super_admin() AND org` or `is_super_admin()` | own org | all | PASS (RLS probe) |
| Email invoice | finance.invoices | admin routes | send-invoice-email | — | own org | all | PASS; active check added (F-05) |
| Client portal access | clients.portal_access | PortalAccessCard | portal-access | — | own org | all | PASS |
| Organisations create/edit | platform.organisations | SuperAdminRoute | `create_org` super only | RLS `is_super_admin()` | — | yes | PASS (owner-only) |
| App settings / feature flags write | platform.app_settings | no UI ("Planned") | — | RLS `is_super_admin()` | — | yes (SQL only) | PASS / N/I UI |
| Audit and error logs | platform.audit_log | SuperAdminRoute | — | RLS | org-scoped admin_audit_log | all | PASS |
| Sync profiles | users.sync_profiles | UserIndex (super only) | `sync_profiles` super only | — | — | yes | PASS |

## Negative paths

| Actor | Attempt | Enforcement | Result |
|---|---|---|---|
| Admin | promote self or anyone to super_admin | `CANNOT_MODIFY_OWN_ROLE`, `CANNOT_ESCALATE_BEYOND_OWN_ROLE`; guard trigger on `role` | PASS |
| Admin | modify the super admin | `is_protected` + (new) role guard on 5 actions | PASS (hardened, F-06) |
| Driver | admin routes / functions | route guards; EF `ADMIN_OR_SUPER_ADMIN_ONLY`; RLS | PASS |
| Portal client | internal UI / staff functions | `PortalRoute`/`ProtectedRoute`; role expands to CLIENT only; `roleSatisfies(CLIENT, *)` false; staffGate | PASS |
| Signed-out | edge functions | `authenticateCaller` → 401 | PASS (code); UNTESTED live |
| Pending / suspended admin | edge functions | `inactiveAccountError` on all admin-gated functions | FAIL → fixed in code (F-05), **deploy awaiting approval** |
| Suspended admin with a still-valid token | REST/RLS | helpers ignore `account_status` | **RISK (F-03), migration awaiting approval** |
| Admin of org A | org B data | `org_id = user_org_id()` in RLS; EF org checks | PASS (RLS probe; one org of data in prod) |
