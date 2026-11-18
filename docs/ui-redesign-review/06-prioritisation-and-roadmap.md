# G. Prioritised UI-only implementation roadmap (planning only)

**Nothing here is authorised or implemented.** Concept A is provisionally approved as a *direction*; no production change, token change or dependency is authorised. Each item below carries a traceability ID (`R##` → `14-traceability.md`). Effort is relative (XS < ½ day, S ≈ 1–2 days, M ≈ 3–5 days, L > 1 week) and is an estimate from reading the code, not a commitment. Benefits are qualitative.

## 1. Prioritisation

Criteria: perceived quality · visual impact · screens affected · reusability · mobile relevance · complexity · regression exposure · design-system dependency.

### Quick wins (do first, independently shippable)
| ID | Change | Files | Effort | Why |
|---|---|---|---|---|
| Q1 | Tinted status badges with dark text (U01, R01) | `src/lib/statusConfig.ts` (colour values only) + the badge render in `JobCard` | S | One edit, every job screen, fixes 5 AA failures |
| Q2 | Light-mode `--warning/--success/--destructive` + foregrounds; `--input` and control borders to `#7C8BA0`; double focus ring (U02, R02–R04) | `src/index.css` | S | Whole-app contrast |
| Q3 | KPI strip: count-aware columns, stacked icon ≤420px (U07, U17, U18, R12) | `control/components/shared/KpiStrip.tsx` | XS | Cleaner first screen |
| Q4 | Pound-appropriate receipt icon (U12, R26); chip-row fade (U13, R15) | `Expenses.tsx` | XS | Polish |
| Q5 | 44px hit areas on 28px icon buttons (U14, R14) | `DetailPanel`, `ControlClients`, `JobMasterList` | XS | Touch reliability |
| Q6 | Single brand-blue token (U11, R08) | `AppHeader.tsx`, `index.css`, `index.html` | XS | Consistency |
| Q7 | Hide breadcrumb band below `md` (U08, R13); lift sidebar group-label/⌘K/subtitle/role-label contrast (U24, U25, R05, R06) | `AppHeader.tsx` / `Breadcrumbs.tsx` | XS | ~32px back on phones |

### P0 — Foundation
| ID | Change | Screens | Effort | Regression exposure |
|---|---|---|---|---|
| P0-1 | Token set (colour, radius, shadow, type scale) in `index.css` + `tailwind.config.ts` | all | M | Medium — global |
| P0-2a | `tabular-nums` utility + system-font stack tokens (no dependency) (R10) | all | XS | Low |
| P0-2b | **Phase 1b, approval-gated:** self-hosted Inter (R11) — decide after real-device check and CLS/table-wrap measurement (`13-…`) | all | S | Low–Medium (layout shift; ≈7% wider text) |
| P0-3 | Semantic tint tokens + shared `StatusBadge` styling via `ui-kit/StatusPill` | job screens | S | Low |
| P0-4 | 12px floor: replace `text-[8..11px]` (383 uses) with scale tokens, hotspot-by-hotspot | ~100 files | L (mechanical) | Medium — truncation/wrapping |

### P1 — High-impact
| ID | Change | Screens | Effort | Regression exposure |
|---|---|---|---|---|
| P1-1 | Ops-role pages inside the Control shell on `lg+` | `/`, `/admin`, `/super-admin`, `/admin/users`, `/admin/timesheets`, `/admin/onboarding` | M–L | **High** — wrappers near route guards; render-only |
| P1-2 | Mobile header consolidation (one band + one header) | ~30 pages | M | Medium |
| P1-3 | KPI/metric component unification | dashboards, jobs, finance | M | Medium |
| P1-4 | Jobs table + toolbar restyle | `/control/jobs` | M | Medium (10 chips, `ResponsiveList`) |
| P1-5 | Job detail restyle (address pins, plate header, CTA) | `/jobs/:id` | M | Medium |
| P1-6 | Auth screens aligned to brand surface | login, forgot, reset, welcome | M | Low (but first impression) |

### P2 — Final polish
Inspection-flow restyle (**highest regression risk; do last**), photo grid states, empty/error state set, compact density mode, print/POD typography, dark-theme derivation, motion tokens + global reduced-motion rule, OG metadata (U15).

**Deliberately not prioritised:** a dramatic redesign of any single bespoke page before P0 lands.

---

## 2. Phased roadmap

All phases: **presentation only**; each phase is visually testable (Playwright screenshots at 390×844, 768×1024, 1440×900, 1920×1080, light + dark) and revertible as one commit/PR. Existing unit tests (`npm test`) and `npm run typecheck` must stay green. Rollback in every phase: revert that phase's PR; tokens are additive so earlier phases don't depend on later ones.

### Phase 1 — Visual tokens and foundations
- **Scope:** Q1, Q2, Q6, P0-1, P0-2, P0-3. Colour/radius/shadow/type tokens; status badge restyle; font self-hosting.
- **Affected:** `src/index.css`, `tailwind.config.ts`, `src/lib/statusConfig.ts`, `ui-kit/StatusPill.tsx`, `package.json` (font package).
- **Dependencies:** approval of the font dependency; dark-theme token derivation decision.
- **Risk:** Medium (global).
- **Acceptance:** all pairs in `04-design-system.md` §1 measure ≥ their required ratio in a rendered build (automated axe/contrast script); `statusConfig` keys, labels and `ADMIN_TRANSITIONS` byte-identical; no layout shift > agreed threshold on 5 key pages.
- **Visual regression checks:** snapshot every route in `02-ui-audit.md` that renders without data; compare badge colours on `/jobs`, `/control/jobs`, `/jobs/:id`.

### Phase 2 — Shared components and application shell
- **Scope:** Q3, Q5, Q7, P1-2, P1-3; button/input/card/table/badge variants; KPI unification; header consolidation.
- **Affected:** `components/ui/*`, `AppHeader`, `Breadcrumbs`, `BottomNav`, `KpiPill`, `KpiStrip`, `ui-kit/*`.
- **Dependencies:** Phase 1.
- **Risk:** Medium. **Acceptance:** same props and `onClick`s; touch targets ≥ 44px measured; mobile fixed chrome ≤ ~112px (down from ≈206px) **as a target to be confirmed**, not a promise.
- **Checks:** component stories/snapshots; keyboard focus order unchanged.

### Phase 3 — Dashboards and data-heavy pages
- **Scope:** `/control` overview, Finance, Profitability, Compliance, POD review; compact density mode; table styling.
- **Affected:** `features/control/pages/*`, `features/control/components/shared/*`.
- **Dependencies:** Phase 2. **Risk:** Medium.
- **Acceptance:** no information removed (checklist of every field/section from today's page); ≥12px text.
- **Checks:** populated-data snapshots using a seeded **non-production** backend or mocked fixtures (not available in this review).

### Phase 4 — Job management and operational screens
- **Scope:** `/control/jobs`, `/jobs`, `/jobs/master`, `/jobs/new|edit`, job detail, completed/pending.
- **Affected:** `ControlJobs.tsx`, `jobs/JobsColumns.tsx`, `JobList.tsx`, `JobDetail.tsx`, `JobCard.tsx`, `DriverJobCard.tsx`, `JobForm.tsx`.
- **Dependencies:** Phases 1–2. **Risk:** Medium–High (job flows are the core).
- **Acceptance:** every existing action reachable with the same results; status labels unchanged.
- **Checks:** E2E smoke for assign / run-order / open job; screenshot diffs at 4 widths.

### Phase 5 — Mobile inspection and field-service screens
- **Scope:** inspection steps, photo grid, signature step, review step, pending uploads, offline banner states.
- **Affected:** `InspectionFlow.tsx` (inline renderers stay inline), `PhotoUploadsStatusGroup`, `SignaturePad`, `PendingUploads.tsx`, `QueuedSubmissionsSection.tsx`.
- **Dependencies:** Phases 1–2. **Risk:** **High.**
- **Acceptance:** typing never loses focus; signature canvas never remounts; draft restore still works; offline capture still queues; verified on real iOS Safari + Android Chrome.
- **Checks:** device-lab run; offline toggle run; screenshot of each step in all states.

### Phase 6 — Admin and super-admin presentation
- **Scope:** P1-1, P1-6, `AdminUsers`, `Timesheets`, onboarding wizards, super-admin pages, auth screens.
- **Dependencies:** Phase 2. **Risk:** High for P1-1 (shell wrappers near guards).
- **Acceptance:** `AdminRoute` / `SuperAdminRoute` / `ProtectedRoute` and nav `requiredRoles` untouched; role matrix test (driver/admin/super-admin) shows identical access.

### Phase 7 — Responsive refinement and visual QA
- **Scope:** 768–1180px breakpoints, landscape phones, dark theme, reduced motion, 200% zoom / large text, print/POD, empty/error sets, P0-4 stragglers.
- **Acceptance:** axe clean on all routes; no horizontal scroll at 320/390/768/1440; WCAG 2.2 AA checks for target size and focus-not-obscured; full before/after screenshot report.
- **Rollback:** per-route revert.

**Do not begin any phase until explicitly authorised.**

## 3. Updates from the evidence-closure pass
- **Phase 1 is split:** 1a (tokens, status badges, contrast, focus ring, `tabular-nums`, sidebar/role-label contrast) needs no new dependency; **1b (self-hosted Inter) is a separate approval**.
- **New prerequisite before Phases 3–4:** capture populated screens against a seeded **non-production** backend or fixtures (R31). Without them, table and dashboard density cannot be judged on the real app.
- **Acceptance criteria now include the re-runnable checks:** `tools/layout-check.cjs` (no overflow, no text <12px, no target <24px, <44px at ≤768px, no hidden table actions), `tools/contrast-check.cjs` (0 AA failures; boundaries ≥3:1), `tools/preservation-matrix.py` (0 missing), and a populated-data screenshot diff at 390 / 768 / 1024 / 1440 / 1920.
- **Sign-offs needed inside phases:** icon-only row actions (R17), inline error summary beside the existing toast (R24), removal of tooltip-only cues (R18), mobile shell unification (R20).
- **Rollback unchanged:** one PR per phase, tokens additive, revert the phase's PR.
- **Still out of scope (not scheduled):** merging super-admin dashboards, splitting status labels, new features, chip counts, global search, bulk actions.
