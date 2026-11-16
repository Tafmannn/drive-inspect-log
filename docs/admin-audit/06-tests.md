# 06 — Tests

## Automated (local)

| Run | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run test -- --run` | **980 passed / 126 files** (944 before this work) |
| `npm run build` | pass |
| `npm run lint` | 354 problems vs 358 on main (no new issues; 4 fewer) |
| `esbuild` syntax check of 6 changed edge functions | pass (no Deno toolchain in sandbox; not type-checked under Deno) |

New coverage:
* **Inheritance:** Admin ⊆ Super Admin capabilities; owner-only capabilities stay with the owner; driver, client and unknown roles get none; client and server expand roles identically; `roleSatisfies` truth table (11 cases).
* **UI parity:** `/super-admin/users`, `/admin/users` and `/control/admin` all render the shared panel. The Control nav shows ADMIN-gated items to a SUPERADMIN-only role list, hides Platform from admins and shows nothing to drivers.
* **Server gates:** `inactiveAccountError` truth table. A source scan checks that every admin-gated edge function applies the active-account rule, and that `user-lifecycle`'s five target actions refuse non-super callers acting on a super admin.

## Live, read-only (production, via rollback-only probes)

Each probe impersonates the real Admin and Super Admin accounts (`set_config('request.jwt.claims')` + `SET LOCAL ROLE authenticated`) inside a block that always ends in `RAISE EXCEPTION`, so nothing persists.

| Probe | Result |
|---|---|
| Row visibility on 18 admin tables | Super ≥ Admin everywhere. Super sees more on `admin_audit_log` (91 vs 9) and `organisations` (2 vs 1) |
| Rows matching each of 50 write policies (UPDATE/DELETE/INSERT/ALL) | 50/50 evaluated, 0 where Admin > Super |
| `role_permission_templates` | All 21 admin-allowed keys (of 27 in the catalogue) are allowed for super_admin |
| Permission overrides | 25 rows, all on driver accounts, none on admin or super_admin |

## Production release checks (2026-11-16)

| Step | Check | Result |
|---|---|---|
| Edge functions | Deployed version, status and `verify_jwt` unchanged | user-lifecycle v57, assign-driver v78, get-org-users v77, send-push v3, send-invoice-email v3, portal-access v2: all ACTIVE, `verify_jwt` as before |
| Migration: before | Per-role helper and permission results (admin, driver, super admin) | Recorded |
| Migration: after | Same per-role results | Identical for all three roles |
| Migration: after | Admin set to `suspended`, then `pending_activation` (rolled back) | Helpers false; `drivers.manage` false; visible driver_profiles 5 → 0, jobs 73 → 0 |
| Migration: after | Account states after the rolled-back probe | Admin and super admin both still `active` |
| Migration: after | 18-table read probe | Identical counts to before; Super ≥ Admin on every table |
| Migration: after | Write-policy probe | 54/54 evaluated, 0 where Admin > Super |
| Migration: after | Privileges and SECURITY DEFINER on the three functions | Unchanged |
| Migration: after | Supabase security advisor | No new findings (existing: leaked-password protection off; expected SECURITY DEFINER helpers) |

Note: there are 54 write policies now against 50 earlier the same day. The 4 new ones come from the driver read-scope rules (branch `claude/charming-johnson-pqznu8`, `20261116120000_driver_read_scope_own_jobs.sql`), applied directly in SQL at 21:13 UTC and not yet in the migration history or on main. All 54 pass the parity check.

## Not verified (limitations)

* **Live UI as each role:** the sandbox can't sign in (Supabase is unreachable), so screens were covered by component tests only.
* **Edge functions after deploy:** each deploy compiled the full bundle (so imports and syntax are sound) and the new versions are active. Live calls from the sandbox aren't possible; no errors appeared in function logs after deploy (no traffic yet at check time).
* **Tenant isolation across two populated orgs:** production has data in one org only. The probes confirm the org predicate is present, not cross-org behaviour.
* **Persistence after refresh:** shown by the code path (mutations refresh the server-backed list and detail queries). Not observed in a browser.

## Follow-up checks (2026-11-16, later)

| Check | Result |
|---|---|
| Brightness check in real Chromium on three JPEGs | night 14 (flagged), dim garage 108 and daylight 198 (not flagged) |
| Feature-switch writes, as each role, against production (rolled back) | super admin: 1 row written; admin and driver: rejected by RLS; no row persisted |
| Break-glass SQL: lock the owner out (demoted, suspended, unprotected, banned), run steps 2–3 (rolled back) | restored to `super_admin / active / protected / not banned`; `is_super_admin()` true; real owner untouched |
| Pending migration dry-run on production (rolled back): `user_org_id()` per role | same single org for admin, driver and super admin |
| same: audit trigger | insert, update and delete each logged with old and new value; a no-change update not logged; admin write rejected |
| same: simulated null-org super admin | `user_org_id()` NULL, still `is_super_admin()`; sees 73 jobs, 5 driver profiles, 6 clients, as before |
| same: parity probes | 11-table read counts: Super ≥ Admin; 58/58 write policies evaluated, 0 where Admin > Super (58 now: PR #107 added invoice policies) |
| After the dry run | no stray flag rows, no trigger or function created, `user_org_id()` unchanged, owner `super_admin / active` |

