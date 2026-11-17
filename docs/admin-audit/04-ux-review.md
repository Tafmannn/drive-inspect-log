# 04 — UX review

All findings in this document come from reading the code plus component tests. **No live visual check was possible:** the sandbox can't sign in to the app (Supabase is unreachable). Treat layout and mobile observations as unverified.

## Navigation

| Area | Observation | Recommendation |
|---|---|---|
| Entry points | An admin lands on `/` (driver-style dashboard with ops tiles). The bottom nav offers Control. `/admin` and `/super-admin` are reached from Profile links and the Control Admin page. | Make `/control` the single admin home. Keep the bottom-nav "Control" tab. |
| Three shells | `/control/*` (Command Centre, nav groups), `/admin/*` (legacy pages with their own headers), `/super-admin/*` (owner console with its own tiles) | Option A: `/control` for operations, plus a **Platform** group (already present) for owner tools. The paired `/admin/*` operations pages were merged into `/control/*` on 2026-11-17 and now redirect (F-09). |
| Duplicates | Jobs queue (`/admin/jobs` vs `/control/jobs`), POD review (`/admin/pod-review` vs `/control/pod-review`), finance (`/admin/finance` vs `/control/finance`), drivers (`/admin/drivers` vs `/control/drivers`), user management (**fixed**: one panel) | **Done 2026-11-17:** one responsive screen per area with both feature sets (R-01). Checked visually at 390 px and 1440 px with mocked data. |
| Owner console | 21 controls; several tiles go to the same 6 pages (Users ×3, Orgs ×3, Audit ×3) | Fold into the Control **Platform** group (Organisations, Users & roles, Audit, Errors, Attention, Settings). |
| Labels | "Organisation Settings" opened the admin dashboard (**fixed**); Settings card claimed a JWT auth source (**fixed**) | Use labels that name the destination. |

## Screens

* **User management** (now shared): the list has search, role, status, archive and (owner) org filters. The detail view has profile, role, account actions, driver profile and permissions. Controls are compact (`text-xs`) and now 44 px high on mobile, compact from the `sm` breakpoint up (R-05, done).
* **Permission editor:** it was misleading (F-04) and now carries a notice. The per-row allow/deny/default selects have no "why" text. Keep it as-is while R-03 enforces keys one at a time.
* **Feature flags:** shown as "Planned". The flags exist only in SQL (`app_settings`, writable by the super admin only). Now an owner-only Feature switches card in Settings (R-06, done).
* **Feedback:** user-management mutations share a single toast pattern (success and error) and refresh the user list. Driver wizard saves show an error toast with the database message and refresh local state. Neither path fails silently.

## Accessibility (spot checks)

* Icon-only buttons in the Control header and notifications: most have text or `aria-label`; not audited exhaustively.
* The new permission notice uses `role="note"` and has contrasting light and dark colours.
