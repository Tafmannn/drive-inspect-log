# E + F. Concept A v2 — visual concept pack and current-vs-proposed comparisons

**Open the prototypes** in a browser: `mockups/v2/*.html` (static, no server, no API, fictional data, "REVIEW PROTOTYPE" ribbon). **Screenshots:** `screenshots/proposed-v2/`. **Superseded first pass:** `mockups/v1-first-pass/` (kept for traceability only).

## What changed from the first pass, and why (honest disclosure)
The first-pass prototypes were **not faithful to the source** in places. The evidence-closure review found and fixed:
| First-pass error | Found by | Fixed in v2 |
|---|---|---|
| Command Center used the **Jobs page KPIs** (Unassigned, Stale, Evidence gaps, POD Review, Active, Total) instead of its own seven (Ready to Dispatch, In Transit, Exceptions, POD Review, Completed Today, Unassigned, Stale (>24h)) | source read | real KPIs |
| Command Center omitted the live status chip, the four shortcuts (New Job, View All Jobs, Drivers, Expenses), Refresh, the "N acknowledged" toggle and row actions | preservation matrix | restored |
| Admin dashboard invented Management items (Users, Timesheets, Onboarding, Create invoice) and omitted Needs Action, compliance strip and the 12 Operations Buckets | source read | real items/labels |
| Super-admin omitted Quick Actions, Attention/Settings/Audit management links, the whole `/control/super-admin` page and the **Feature switches** card | screenshot review | three pages drawn |
| Jobs chips showed counts that do not exist in the app; status cell dropped the Stale/Blocked/Action needed/Heads up cues; row actions reduced | preservation matrix | counts removed, cues visible, all four actions kept |
| Job detail (driver) replaced the bottom nav with the CTA; mobile cards dropped View/POD/Expense | preservation + visual QA | nav restored; full actions |
| `#8795A8` borders failed 3:1 on the tinted background; focus ring ≈1.8:1; 11px text; sub-44px targets; invisible table actions with long data | rendered checks / populated tests | token and layout fixes (`10-…`, `12-…`) |

## Concept A v2 identity (restrained, Axentra-specific)
- **Brand mark** from the repo's own logo (chevron + swoosh) in the sidebar; navy `#0B1C3F` for the mobile brand band and avatars; action blue `#1E4FA8`.
- **Route spine** — a small three-node line (collect → transit → deliver) on mobile job cards and the job-detail workflow bar, echoing the logo's direction of travel; it is the only decorative element.
- **Tinted status pills with a dot** (no white-on-saturated), **UK number plate** as the vehicle anchor, one soft shadow, no gradients.
- **One shell** for every role: 248px light sidebar (existing groups/labels), 56px top bar (breadcrumb, ⌘K search, bell, avatar), icon rail ≤1180px, menu button ≤900px; mobile driver app keeps brand band + 4-tab nav.

## The six screens (+ variants)
| # | Screen | Prototype | Screenshot(s) | Current reference (packaged) |
|---|---|---|---|---|
| 1 | Main dashboard — Command Center (desktop) | `v2/01-command-center.html` | `v2-01-command-center.png`; responsive `v2-r-01-{1920,1180,1024,768,390}.png` | `current/desktop-control-overview.png`, `mobile-control-overview.png` |
| 2 | Jobs management (desktop) | `v2/02-jobs.html`, `02b-jobs-queues.html` | `v2-02-jobs.png`, `v2-02b-jobs-queues.png`; `v2-r-02-*.png` | `current/desktop-control-jobs.png`, `mobile-control-jobs.png` |
| 3 | Job details (mobile; driver + admin) | `v2/03-job-detail-mobile.html` | `v2-03a/b/c-*.png` | `current/mobile-driver-job-detail.png` (skeleton only) |
| 4 | Vehicle inspection (mobile; steps 1–6) | `v2/04-inspection-mobile.html` | `v2-04a…04f-*.png` | `current/mobile-driver-inspection.png` (spinner only) |
| 5 | Admin dashboard (desktop) | `v2/05-admin-dashboard.html` | `v2-05-admin-dashboard.png` | `current/desktop-admin-dash.png`, `desktop-admin-home.png`, `mobile-admin-home.png` |
| 6 | Super-admin: `/control/super-admin`, `/super-admin`, settings | `v2/06a-…`, `06b-…`, `06c-…` | `v2-06a/06b/06c-*.png` | `current/desktop-control-super.png`, `desktop-super-dash.png`, `desktop-super-settings.png`, `mobile-control-super.png` |
| — | States (hover/focus/disabled/invalid, alerts, skeleton, empty, dialog) | `v2/08-states.html` | `v2-08-states.png` | — |
| — | Populated stress tests | `v2/09a…09f-*.html` | `v2-09*.png` | see `10-populated-layout-assessment.md` |
| — | Font comparison | `v2/10-font-comparison.html` | `v2-10-font-comparison.png` | see `13-…` |
| — | Three directions (style tiles) | `07-directions-style-tiles.html` | `v2-07-directions-style-tiles.png` | — |

**Preservation status (computed, `11-preservation-matrices.md`):** 151 elements preserved, 8 shown as labelled placeholders (content unreviewed), 14 documented as *not drawn*, **0 missing** across the six screens.

**Limits of the "current" side of every comparison:** the current screenshots show skeletons/empty states (no populated data); they establish shell, controls and chrome, not populated density. Where the current app was never seen rendered (portal, inspection steps, photo grids, POD, feature flags), the comparison is against source code, and this is stated.

---

## Comparison 1 — Command Center (`/control`)
| | Current [V where marked] | Proposed v2 |
|---|---|---|
| Appearance | light sidebar, 7 KPI frames (orphan on row 2 at 1440px [V]), shortcut buttons, sections loading [V]; 25.3% of rendered desktop text fails contrast, sidebar group labels 2.61:1 [M] | same structure, 7 tiles on one row, tinted-state edges, status chip, shortcuts and all five sections with real labels |
| Components | `KpiStrip`, `ControlSection`, `CompactTable`, `QuickActionsBar` | same components restyled |
| Typography | 10–11px uppercase labels [M] | 12–13px sentence-case, 26px tabular KPI values |
| Layout | single column | single column of full-width cards; tables breathe at 1440 |
| Colour | pale icon chips, raw palette | semantic tints, dark-on-tint badges |
| Accessibility | see left | every text node ≥5.30:1 (2,274 measured); 12px floor |
| Perceived quality | competent, sparse | calmer, clearer priority order |
| Regression risk | `KpiStrip` column rule affects every Control page; table widths with real data | snapshot `/control` at 1024/1280/1440/1920 with populated data |

## Comparison 2 — Jobs (`/control/jobs`)
| | Current | Proposed v2 |
|---|---|---|
| Appearance | KPI frames, one-row toolbar with 10 chips (wraps; clips on mobile [V]), queue skeletons [V] | KPI strip, two-row toolbar (search + sort / chips), table card |
| Table | never seen populated [C: 8 columns, 10px status cues in tooltips] | Ref · Vehicle(plate+model) · Client · Driver · Route · Status(+visible cues) · Updated · 32px icon actions with sticky actions column; two-line clamp for long names |
| Mobile | chip row clips | card list with labelled 44px actions (View · Assign/Reassign · POD · Expense) |
| Accessibility | row actions `h-6 text-[10px]` [C] | action names via `aria-label`+tooltip; text labels on mobile; targets ≥24px desktop, ≥44px mobile |
| Regression risk | high: 10 chips, run-order and assign dialogs, row-click propagation | populated screenshot diff; keep `ResponsiveList`; **icon-only actions are a visible change to confirm** |

## Comparison 3 — Job details (mobile)
| | Current | Proposed v2 |
|---|---|---|
| Appearance | skeletons [V]; structure from `JobDetail.tsx` [C]: header card, Collect From/Deliver To, Inspections, QR, Notes, admin sections | status + evidence slot + large plate + workflow bar; A/B address cards with Call/Navigate; sticky next-step CTA **above** the bottom nav |
| Chrome | three header bands + nav ≈24% [M] | one brand band + one title row |
| Admin | Evidence Health, price/pricing/audit, Change status, Cancel, photos [C] | same, drawn as placeholders where content was not reviewed |
| Regression risk | sticky CTA vs keyboard/QR modal; `DriverJobLocked`/not-found states | test with long text (`09f`) and real modal |

## Comparison 4 — Vehicle inspection (mobile)
| | Current | Proposed v2 |
|---|---|---|
| Evidence | spinner only [V]; steps and labels from source [C] | step bar, all six pickup steps drawn: 52px odometer, 44px segmented fuel level, full checklist (all radio groups + Number of Keys + Alloys/Trims), damage diagram, 7 photo slots + additional, signatures, review |
| Validation | toast "Please complete the required fields" + missing list [C] | toast **plus** inline summary and per-field messages from the same list (**needs sign-off**) |
| Regression risk | **highest**: renderers are inline on purpose (focus loss, signature canvas remount); offline/draft restore | do last; device-test iOS Safari + Android Chrome; keep renderers inline |

## Comparison 5 — Admin dashboard (`/admin`, `/`)
| | Current | Proposed v2 |
|---|---|---|
| Appearance | ~744px column in 1440px + full-width bottom nav [V]; mobile KPI labels truncate [V] | Control shell, 4 KPI tiles, compliance strip, Needs Action / Stale Active / Awaiting Review, 12 Operations Buckets, Management (6 items) |
| Regression risk | moving presentation into a different shell touches wrappers near `AdminRoute`/`ProtectedRoute` | render-only; role-matrix test |

## Comparison 6 — Super-admin
| | Current | Proposed v2 |
|---|---|---|
| Appearance | two different dashboards [V]; legacy page is a stretched mobile column [V]; `/control/super-admin` mobile KPI labels truncate to 2–3 characters [V]; settings has Feature switches (spinner only) [V] | one presentation for both routes; all KPIs, quick actions, queue, orgs, audit, errors, management links, role model, feature-switch rows (**placeholder flags**), platform controls |
| Out of scope | merging the two dashboards | not done |

## Shared components whose redesign lifts many screens
| Component / file | Screens | Traceability |
|---|---|---|
| `statusConfig.ts` badge | every job list/card/detail/POD | U01 |
| `index.css` tokens (+ `--input`, focus ring) | whole app | U02, U11 |
| `KpiStrip` / `KpiPill` / `MetricBlock` | dashboards, jobs, finance, super-admin | U07, U17, U18 |
| `AppHeader` + `Breadcrumbs` | ~30 pages | U08, U25 |
| Control sidebar (group labels, search hint) | all `/control/*` | U24 |
| `ui/button, input, badge, card` | everything | U14, U27 |
| Shell wrapper for ops pages | `/`, `/admin*`, `/super-admin*` | U03, U04, U20, U23 |
