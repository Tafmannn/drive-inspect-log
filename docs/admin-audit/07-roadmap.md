# 07 — Roadmap

| ID | Pri | Item | Depends on | Size |
|---|---|---|---|---|
| A-1 | P0 | **Approve and apply** the active-only RLS helper migration (F-03), then run the 06-tests probes | approval | S |
| A-2 | P1 | **Approve and deploy** the 6 edge functions (F-05, F-06) | approval | S |
| A-3 | P1 | **Approve merge and deploy** of the frontend (F-01, F-02, F-04 notice, F-07) | approval | S |
| R-01 | P2 | Consolidate duplicate admin pages onto `/control`: redirect `/admin/jobs`, `/admin/pod-review`, `/admin/finance` and `/admin/drivers` once each `/control` page has parity; fold the owner console tiles into the Control **Platform** group | A-3 | M |
| R-02 | P2 | `user_org_id()`: drop the "oldest org" fallback for a super admin without an org (F-08); re-run the RLS probes | approval | S |
| R-03 | P1 | Permission overrides: decide **enforce** (check selected keys such as `drivers.manage`, `jobs.assign` and `reports.export` in RLS and edge functions via `current_user_has_permission`) or **remove** the editor. Recommendation: remove until a real need for per-user restrictions exists; roles plus suspension cover today's single-org use. | decision | M (enforce) / S (remove) |
| R-04 | P2 | One admin-route guard component: `AdminRoute`, `ControlRoute` and the per-page `isAdmin` checks overlap; keep the route guard and drop the in-page duplicates | — | S |
| R-05 | P2 | Touch targets: user-management buttons are 28–32 px high; raise primary actions to 44 px on mobile | — | S |
| R-06 | P3 | Owner-only feature-flag toggles (`app_settings`, write already super-admin-only in RLS) | — | S |
| R-07 | P3 | Owner recovery: document a break-glass procedure (Supabase dashboard SQL to restore `role='super_admin'`, `is_protected=true`, `account_status='active'`); consider a second protected super admin held offline. Never expose service credentials in the app. | — | S |
| R-08 | P4 | Multi-tenant SaaS (tenant onboarding, per-org billing): only if a second operator signs up | commercial | L |

Not recommended now: a general policy engine. Roles plus RLS helpers plus a small capability map cover the current single-operator model.
