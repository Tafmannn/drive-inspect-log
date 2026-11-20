# Admin Home — UI refresh (spec, inventory, verification)

Scope: presentation only for the admin / super-admin home (`/`) and `/admin`, which share
`AdminDashboardBody`. No queries, query keys, hooks, calculations, routes, permissions or
Supabase objects were changed. Driver home is untouched.

Visual authority: the approved Axentra dashboard reference (supplied screenshot, Nov 2026).

## 1. Design specification

**Typography**: system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, …`),
so iPhone/Mac render SF natively and no font files are shipped. Antialiased, tabular figures
(`.ah-num`) for every count.

| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Screen title (greeting) | 28 → 30 (≥380) → 34 (≥640) / 1.12 | 600 | −0.025em |
| Date, subtitle | 15 / 20 | 400 | 0 |
| Section heading | 17 / 24 | 600 | −0.012em |
| Banner title | 19 / 24 | 600 | −0.015em |
| KPI value | 30–32 (24 when > 6 chars) | 600 | −0.03em |
| KPI / row label | 14–15 / 20 | 500 / 400 | 0 |
| Pipeline count | 20 / 28 | 600 | −0.02em |
| Supporting, chips, ages | 12–13 / 18 | 400–600 | 0 |
| Dock label | 11 / 13 | 500 | 0.005em |
| Buttons | 14–15 | 600 | 0 |

No uppercase labels; job-status labels from `statusConfig` are shown in sentence case (display only).

**Spacing**: 4-pt grid. Page gutter 16 (24 ≥640, 32 ≥1024). Gap between cards 16 (20 ≥640).
Card padding 16/20; list rows 56–60 px tall; icon squares 36–40 px.

**Colour**: existing tokens (`--primary` #1E4FA8 cobalt, `--success/--warning/--destructive` and
their `-soft` tints). Home-only tokens in `features/admin-home/admin-home.css`, each with a dark
value: page `hsl(216 33% 97%)`, hairline borders, navy `hsl(222 76% 17%)` → `hsl(220 78% 30%)`
banner. Colour follows meaning: zero counts are neutral grey; warm/red only when a count needing
action is above zero.

**Surfaces**: cards radius 20, banner 22, dock 26, chips/buttons full pill. 1 px border plus a
three-layer soft shadow (≤ 14% opacity). Translucency only on the dock, with a solid fallback.

**Motion** (CSS only, no new dependency): press = `scale(.97)` in 90 ms, release with
`cubic-bezier(.23,1,.32,1)` over 260 ms (interruptible: transitions retarget mid-flight). List
rows tint instead of scaling. Hover effects gated to `(hover: hover) and (pointer: fine)`.
One 320 ms body entrance (opacity + 6 px). `prefers-reduced-motion`: no transforms; fades only.
Native scrolling throughout; no scroll-linked effects.

**Layout**: phones are a single column (KPI tiles 2×2). At ≥768 px the KPIs go 4-across. At ≥1024 px
there are two columns (7:5): queue, snapshots and activity on the left; pipeline, operations,
compliance and management on the right.
Mobile order is set with `order-*` through `display: contents` wrappers.

**iOS**: the app uses `black-translucent` status bar (white text). The home header paints a navy
strip of exactly `env(safe-area-inset-top)` so the status bar stays legible in the installed PWA;
it is 0 px in a browser tab. Dock sits above `env(safe-area-inset-bottom)` + 10 px and respects
landscape left/right insets.

**Logo**: original `/axentra-logo-lockup.webp`, mark cropped with CSS (not edited or redrawn);
product name is live text, as in `AppHeader`. A vector horizontal lockup would be sharper still.

## 2. Data → UI mapping (all existing sources)

| UI | Source (unchanged) | Destination (unchanged) |
|---|---|---|
| Active jobs | `useAdminJobQueueKpis().active` | `/control/jobs?view=active` |
| Completed, not invoiced | `useAdminOperationsBuckets().completed_not_invoiced` | `/control/invoice-prep` |
| Ready to invoice | `…buckets.ready_to_invoice` | `/control/invoice-prep` |
| Needs review | `kpis.podReview` | `/control/pod-review` |
| Banner | Needs Action items (same ranking code) → else `completed_not_invoiced` → else all clear | scroll to queue / `/control/invoice-prep` |
| Pipeline | buckets `needs_driver_action`, `needs_admin_review`, `ready_to_invoice` (disjoint status sets) | each bucket's `defaultRoute` |
| Operations | kpis `unassigned`, `stale`, `podReview`; `useAdminMissingEvidence` | previous KPI-pill routes |
| Driver compliance | `useAdminComplianceCounts` | `/admin/onboarding` |
| Recently updated | rows already loaded by `useAdminJobQueues`, newest first | `/jobs/:id` |
| All operational buckets | `BUCKET_DEFS` + bucket counts (all 9 kept) | each `defaultRoute` |

Not shown, because the app has no source for them: revenue/£ values, growth %, System Health.

## 3. Functional inventory (before → after)

All preserved: KPI pills (now Operations rows), compliance strip (now a card), Needs Action
queue with row tap, Assign → `AssignDriverModal`, View / Review / Review POD, Stale active and
Awaiting review snapshots with View all, Assign and View, all 9 bucket buttons, Management
links incl. super-admin-only console, brand button → `/`, role label, bottom nav tabs,
`useRefetchOnFocus` keys, `useEvidenceAckRealtime`. Added: profile avatar → `/profile` (existing
destination), attention banner and pipeline (views of existing counts).

Behavioural notes: the compliance card is now always visible (previously hidden at zero);
the floating dock is used on the admin home only (other routes keep the bar).

## 4. Verification (2026-11-20)

- `npm run typecheck` ✓ · `npm test` 179 files / 1546 tests ✓ · `npm run build` ✓
- `npx eslint` on touched files: no new errors (2 pre-existing `any` in pages, unchanged lines).
- New: `src/test/admin-home-ui.test.tsx` (banner states, destinations, assign modal, no £/%).
- Browser QA (Playwright, Chromium, preview harness): 47/47 checks: 31 navigation targets,
  role visibility, Assign modal open/Escape, three banner states, Review now scroll + focus,
  loading skeletons, all touch targets ≥ 44×44, keyboard Tab reachability, reduced motion,
  axe-core WCAG 2.1 A/AA with zero violations in light and dark.
- No horizontal overflow at 320/360/390/430/768/1024/1280 and 844×390 landscape.
- Scroll under 4× CPU throttle (390@3x): p95 frame 16.8 ms, 0 frames > 33 ms, CLS 0.
- **Not verified:** physical iPhone (Safari and installed PWA), VoiceOver, Dynamic Type at OS
  level, real Supabase data.

## 5. Preview harness

`VITE_ENABLE_AUTH=false npx vite` then open `/preview/admin-home.html?fixture=busy|calm|invoicing|worst|loading`
(`&theme=dark`, `&role=SUPERADMIN`). Renders the real `<Dashboard/>` from mock fixtures in
`src/dev/adminHomePreview.tsx`; not included in `vite build`.

## 6. Screenshots

`screenshots/`: real browser renders, lossless PNG. Phones at 3× (320→960, 390→1170,
430→1290 px wide), desktop at 2× (1280→2560). `before-after-*` pairs use identical viewport and
scale. Emulated in Chromium, not captured on an iPhone.
