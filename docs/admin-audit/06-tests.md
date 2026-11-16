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

## Not verified (limitations)

* **Live UI as each role:** the sandbox can't sign in (Supabase is unreachable), so screens were covered by component tests only.
* **Edge-function behaviour after deploy:** awaiting deploy approval.
* **The RLS migration:** not applied. After approval, run these:
  ```sql
  -- expect: admin and super_admin both true while active
  -- (impersonate each; read-only)
  select public.is_admin_or_super_admin(), public.is_super_admin();
  ```
  Then re-run the 18-table read probe and the 50-policy write probe; both must still show Super ≥ Admin. Finally, on a disposable test admin set to `suspended`, confirm both helpers return false.
* **Tenant isolation across two populated orgs:** production has data in one org only. The probes confirm the org predicate is present, not cross-org behaviour.
* **Persistence after refresh:** shown by the code path (mutations refresh the server-backed list and detail queries). Not observed in a browser.
