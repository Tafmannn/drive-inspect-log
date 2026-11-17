# 07 — Roadmap

| ID | Pri | Item | Depends on | Size |
|---|---|---|---|---|
| A-1 | P0 | ~~Apply the active-only RLS helper migration (F-03)~~ **Done 2026-11-16** | — | — |
| A-2 | P1 | ~~Deploy the 6 edge functions (F-05, F-06)~~ **Done 2026-11-16** | — | — |
| A-3 | P1 | ~~Merge and deploy the frontend (F-01, F-02, F-04 notice, F-07)~~ **Done 2026-11-16** | — | — |
| A-4 | P1 | Finish PR #107 (driver read scope, in its own session): run `APPLY_lock_closed_jobs.sql`, then merge. Its migrations 1–2 are already live in production; migration 3 is not. Checked 2026-11-16: it merges cleanly with #108. After it merges, update the Permission editor notice: `pod.view` will then change access. | #107 session | S |
| R-01 | P2 | Unify each mobile/desktop pair (jobs, POD review, finance, drivers) into one responsive screen that keeps both feature sets (see F-09). Do one area at a time. Redirect `/admin/*` only after its area is merged. Fold the owner console tiles into the Control **Platform** group. Needs layout decisions from the owner. | decision | L |
| R-02 | P2 | ~~`user_org_id()`: drop the oldest-org fallback (F-08)~~ **Done 2026-11-16** (migration `20261116222659`) | — | — |
| R-03 | P1 | Permission overrides: decide **enforce** (check selected keys such as `drivers.manage`, `jobs.assign` and `reports.export` in RLS and edge functions via `current_user_has_permission`) or **remove** the editor. Recommendation (updated 2026-11-16): **enforce**, one key at a time. PR #107 already enforces `pod.view` for drivers; removing the editor would break that. | #107 | M |
| R-04 | P2 | One admin-route guard component: `AdminRoute`, `ControlRoute` and the per-page `isAdmin` checks overlap; keep the route guard and drop the in-page duplicates | — | S |
| R-05 | P2 | ~~Touch targets~~ **Done 2026-11-16**: user-management buttons, inputs and selects are 44 px on mobile (compact from the `sm` breakpoint up) | — | — |
| R-06 | P3 | ~~Owner feature switches~~ **Done 2026-11-16**: Super Admin → Settings → Feature switches. Not audited: a change to a flag isn't recorded in `admin_audit_log` (needs a database trigger; see R-09) | — | — |
| R-07 | P3 | ~~Owner recovery~~ **Done 2026-11-16**: see 08-break-glass.md. A second Super Admin is not recommended (single-owner intent); Supabase dashboard login with two-factor authentication is the recovery path. | — | — |
| R-08 | P4 | Multi-tenant SaaS (tenant onboarding, per-org billing): only if a second operator signs up | commercial | L |
| R-09 | P2 | ~~Audit trail for platform settings~~ **Done 2026-11-16**: every `app_settings` change by a signed-in user is recorded in `admin_audit_log` (who, old value, new value) | — | — |

Not recommended now: a general policy engine. Roles plus RLS helpers plus a small capability map cover the current single-operator model.
