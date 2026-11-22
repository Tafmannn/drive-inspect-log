# Admin Home — UI refresh (spec, inventory, verification)

> **Refinement pass (after `ed9e69b`)**: compact KPI tiles, a denser first screen, and
> truthful labels. See §7; it supersedes the earlier sections where they differ.

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

## 7. Refinement pass (after ed9e69b)

**First screen (390×844, busy fixture).** The header is 52 px (was 64). The greeting is date plus
title only; the filler subtitle is gone. KPI tiles are 89 px (was ~130). The banner is 104 px with
the CTA in the title row (was 168 px, with a full-width button). Result: the first queue row ends
at 580 px and three rows are visible above the dock (top 766 px). Before, none were.
At 430×932 the first row ends at 580 px (dock at 854).

**KPI tiles.** The value leads at full tile width and is never truncated. Font steps down by
length: 28 → 24 → 21 px, and values of a million or more are compact ("1.2M"; the exact value is
in `aria-label`). The label sits beside an 18 px tinted icon. There are no chevrons; the card, the
press state and the hover lift carry the affordance. Zero values are drawn at 45% ink so calm
states stay calm.

**Truthful labels (display only; queries and `BUCKET_DEFS` unchanged).**

| Count (unchanged source) | What it actually checks | Old label | New label / placement |
|---|---|---|---|
| `completed_not_invoiced` | *(at the time)* completed/closed AND `pod_pdf_url` is null | "Completed, not invoiced" (KPI) | "Completed, no POD PDF" in Operations. **Superseded:** the count now checks invoices, so it is labelled "Completed, not invoiced" again (see below) |
| `ready_to_invoice` | *(at the time)* completed/closed, client, price > 0, both inspections, not test; no invoice check | "Ready to invoice" | "Invoice candidates". **Superseded:** invoiced jobs are now excluded, so it is "Ready to invoice" again |
| `failed_uploads` | hard-coded `0` in the hook | "0" | "—" with hint: counted on each device; open Pending uploads |
| KPI slot freed | `kpis.unassigned` (existing) | — | "Unassigned" KPI tile (same route as before) |
| `kpis.podReview` | `pod_ready`, `delivery_complete` | "Needs review" | "POD review" (it is not the same set as `needs_admin_review`) |

**Banner / empty state.** If the job-queues or attention query errors, the banner shows "Some
queues didn’t load, so counts below may be incomplete" with **Try again** (calls `refetch()` on those two
existing queries). It never says "All clear" on a failed load. The empty state now says exactly what
was checked: "Action queue is empty: no unassigned, stale, evidence or POD items at HH:MM"
(from `dataUpdatedAt`). The attention title is "Needs your attention", and the breakdown is a list of
parts that never break mid-part.

**Pipeline → Job queues.** It now shows three independent queue counts (With drivers ·
Admin review · Evidence blocked), separated by hairlines, with **no connector line or arrows**.
These are status buckets, not a sequence every job passes through. "Evidence blocked" (an existing
bucket, previously only in the folded list) replaced "Ready to invoice", which already has a KPI.

**Rows.** Job references are never truncated at realistic lengths. Below 380 px the row action
wraps under the content. Below 440 px the action button's icon is hidden (the label is kept). Rows
are 4 px tighter.

**Motion (emil-design-eng).** Press is `scale(.97)`, 100 ms in and 160 ms out, with
`cubic-bezier(.23,1,.32,1)`. That is CSS easing, not spring physics. The entrance is 240 ms
(was 320). The disclosure chevron is 200 ms. Reduced motion: no transforms. No haptics are claimed.

**Underlying data defects: fixed in a follow-up (branch `claude/admin-home-data-defects`).**
1. `safeCount` / `countPricedCandidates` returned 0 on a query error. Now every bucket is
   `number | null`; a failed query is `null`, and the UI shows it as "—".
2. `useAdminJobQueueKpis` ignored its count errors. Each KPI is now `null` on error.
3. `completed_not_invoiced` was a POD-PDF proxy. It now means completed or closed visible jobs
   with no non-cancelled invoice, checked with `findAlreadyInvoicedJobs`.
4. `ready_to_invoice` didn't exclude invoiced jobs. It now does, with the same guard; the guard
   fails closed, so the bucket is `null` if the invoice lookup errors.
5. `failed_uploads` was hard-coded to 0. It is now always `null`: uploads that fail are queued on
   each driver's device and are not recorded centrally.
6. (found while fixing) id-list queries were capped at 1,000 rows. They are now paged with `range()`.

With 3 and 4 fixed, the UI labels return to "Completed, not invoiced" and "Ready to invoice",
and the banner fallback says "N completed jobs are not yet invoiced." The preview has a new
`?fixture=unavailable` that shows the "—" state.

**Verification (this pass).**

- `typecheck` ✓, `build` ✓, full `npm test` ✓ (see the commit).
- `admin-home-ui.test.tsx`: 9 tests (error state, truthful labels, dash for failed uploads).
- Browser QA: 56/56. That covers 30 navigation targets, roles, the Assign modal, banner states,
  Review → scroll and focus, the first row above the dock at 390 and 430, no clipped figures or
  headings at 320/390 (busy and worst case), no truncated references, 44 px targets, keyboard,
  reduced motion, and axe WCAG 2.1 AA in light and dark.
- **Not verified:** physical iPhone (Safari and the installed PWA), VoiceOver, OS text size.

Screenshots: `screenshots/` holds first screens. `screenshots/full/` holds full pages.
`screenshots/compare/` holds `ed9e69b` vs now and `main` vs now, at identical viewport and DPR.

## 8. Production refinement (2026-11-21)

### Metric reference (verified against code; live figures from read-only aggregate queries)

| Metric | Source | Definition | Destination |
|---|---|---|---|
| Active jobs | `useAdminJobQueueKpis.active` | visible jobs in `ACTIVE_STATUSES` (assigned → delivery in progress) | `/control/jobs?view=active` |
| Unassigned | `kpis.unassigned` | active, `driver_id` and `driver_name` both null | `/control/jobs?view=unassigned` |
| POD review | `kpis.podReview` | `pod_ready`, `delivery_complete` | `/control/pod-review` |
| Stale jobs | `kpis.stale` | active, not updated for 24 h | `/control/jobs?view=stale` |
| With drivers | bucket `needs_driver_action` | driver statuses (now incl. `pickup_in_progress`) | `/control/jobs?view=active` |
| Due today | bucket `todays_active` | driver or review status, `job_date` = today | `/control/jobs?view=active` |
| Missing inspection | `useAdminMissingEvidence` | completed/delivered in the last 7 days with a pickup or delivery inspection flag false, minus admin-dismissed | `/control/jobs?view=evidence` (the same 7-day queue) |
| Ready to invoice | bucket `ready_to_invoice` | live (`is_test` false), completed/closed, client linked, both inspections, price > 0, no non-cancelled invoice | `/control/invoice-prep` |
| Can’t invoice yet | `completed_not_invoiced − ready_to_invoice` | live completed jobs not invoiced and missing a client, price or inspection (`ready` is a strict subset) | `/control/clients/link-jobs` |
| Needs action / banner | Needs Action items | unassigned + stale + high/critical evidence exceptions + POD review backlog | scroll to the queue |

Any count that fails to load is `null` and shown as "—". An unknown count never raises a banner.

### 3 ready vs 60 not invoiced: reconciled (live, 2026-11-21)
Of 60 completed, uninvoiced visible jobs: **56 were test jobs**, 1 had no client linked, 3 were ready (2 untagged source, 1 Movex).
`completed_not_invoiced` now excludes test jobs, matching Invoice Prep, `ready_to_invoice` and the weekly unbilled figure.
On the same data the dashboard now reads: ready 3, can’t invoice yet 1.
The app has **no platform-specific invoicing rule**: no code reads `job_source`. A Movex job that meets the criteria counts as ready to invoice. If platform jobs are paid by the platform (self-billing), that rule needs defining before the dashboard can exclude them.

### Other changes
- The attention banner summarises the Needs action queue only. It no longer raises "N not yet invoiced" while the queue is empty. Invoicing has its own section.
- KPI tiles are operational: Active, Unassigned, POD review, Stale. Ready to invoice moved into Invoicing.
- The greeting stays on one line: first name capitalised, dropped if it would be too long (`features/admin-home/greeting.ts`).
- Zero figures use `--muted-foreground` instead of 45% opacity. They measured 2.88:1 in light and 4.32:1 in dark; every home text now meets AA in both themes, by computed ratio.
- Update prompt (`components/UpdatePrompt.tsx`, `lib/updatePolicy.ts`):
  - held on job, expense and invoice forms as well as inspections
  - "Update" refuses to reload while an upload is in flight, and says why
  - while visible it reserves scroll space (`--update-prompt-space` on `#root`)
  - "Later" is unchanged (dismissed for the session)
- RLS is enabled, with policies, on `jobs`, `job_pricing`, `invoices`, `invoice_items`, `user_profiles`, `driver_profiles` and `client_logs` (read-only catalogue check).

Screenshots: `screenshots/refinement-3/` (before = `main` 16c50c6, after = this change; 390 px at 3×).

## 9. Test data silenced everywhere (2026-11-22)

Owner decision: test records are hidden from every screen; nothing is deleted.

- **Database (live in production since 2026-11-22)**, migration `20261121180000_silence_test_data`:
  - RESTRICTIVE SELECT policies `*_hide_test_data` on `jobs`, `invoices` and `expenses` for `anon` and
    `authenticated`, `USING (is_test = false)`
  - the six customer-facing SECURITY DEFINER functions (`portal_list_jobs`, `portal_get_job`,
    `portal_list_invoices`, `portal_get_invoice`, `portal_can_read_invoice_pdf`, `qr_lookup`) filter test data too
  - the service role still sees everything
- **Verified on production (read-only, as a signed-in admin):** 4 of 76 jobs visible, 0 test jobs, 0 test
  invoices, 0 test expenses. All 72 test jobs are still stored. History row recorded.
- **Staging was skipped with owner sign-off.** Staging's schema has drifted: 16 production functions are not
  created by any repo migration, so the staging sync can't run. That needs fixing separately (rebuild staging
  from a production schema dump).
- **Rollback:** `supabase/rollback/20261121180000_silence_test_data.down.sql`. Its function bodies were checked
  byte-identical (MD5) to production's live definitions before the change.
- **Edge functions** (`notify-customers` skips test jobs; `portal-access` count excludes them): these deploy
  through the Supabase GitHub integration on merge. At apply time no customer notifications were queued, and
  app users can no longer change test jobs, so no test-job email can be queued before then.
- **To show a record again:** set `is_test = false` on it (service role / SQL editor).
- **Movex and Revilo:** no platform-specific invoicing rule. They are invoiced manually for now (owner decision).
