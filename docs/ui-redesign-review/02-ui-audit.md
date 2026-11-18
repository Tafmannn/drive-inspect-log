# B. Final evidence-based UI audit

**Status:** revised after the evidence-closure pass. Supersedes the first-pass audit, whose conclusions rested on 10 of 88 screenshots. Several scores and findings changed; the changes are called out.

## 1. Evidence base (and its limits)
| Source | What it gives | Limit |
|---|---|---|
| **All 88 screenshots reviewed** (44 routes × desktop 1440 / mobile 390) — classification in `09-screen-coverage-matrix.md`: **14 fully assessed, 44 partially assessed, 26 loading/empty/error only, 4 unavailable** | shell, navigation, controls, static pages, forms, empty/error states | **No populated-data screen exists**: the backend was deliberately unreachable, so lists, tables, badges, photos and real dashboards were never seen in the current app |
| **Rendered-DOM measurement of the current app** (`tools/current-ui-metrics.cjs`, 25 routes × 2 viewports) | real text sizes and contrast of chrome (sidebar, headers, nav, chips) | skeleton/empty states under-represent badges and rows; login/forgot pages indeterminate |
| **Source reading** of every route file and shared component | structure, labels, controls, colours | not seen rendered |
| **Token / hex arithmetic** | status badge and semantic-token contrast | calculated, not measured on pixels |
| **Populated demonstrations of the *proposed* design** (`10-populated-layout-assessment.md`) | how the *new* system copes with hard content | these test the proposal, not the current app |

Evidence classes: **[V]** verified in a screenshot · **[M]** measured by script · **[C]** read from code · **[J]** judgement.

**Font caveat:** this container resolves `system-ui` to Inter, so all current-state screenshots render in Inter; real devices use SF Pro, Roboto or Segoe UI. See `13-typography-and-font-evaluation.md`.

## 2. Scores (0–10) — revised
Criteria: 0–2 broken · 3–4 inconsistent with visible defects · 5–6 competent but unrefined, defects on key screens · 7–8 polished, minor gaps · 9–10 best-in-class. All are **[J] judgement** anchored on the evidence shown; confidence reflects how much was rendered vs inferred.

| # | Dimension | First pass | **Now** | Confidence | Why (and what changed) |
|---|---|---|---|---|---|
| 1 | Overall aesthetic maturity | 6.0 | **6.0** | Medium | Clean shadcn base; Control shell tasteful [V]; undermined by inconsistency |
| 2 | Visual consistency | 5.0 | **4.5** | High | Two different mobile shells for ops roles (hamburger Control shell vs bottom-nav shell) [V]; two different super-admin dashboards [V]; shell-less `/admin/users` [V]; dark-glass login [V]; 3 brand blues [M] |
| 3 | Typography & readability | 6.0 | **5.5** | High | No typeface declared, system font varies by device [M]; **25.7% of rendered desktop text and 25.8% of mobile text is below 12px** [M] |
| 4 | Colour sophistication | 5.0 | **5.0** | High | Status badges 2.20–4.02:1 [M]; raw palette classes ≈100 lines [M] |
| 5 | Spacing & alignment | 6.5 | **6.5** | Medium | Mostly consistent; KPI orphan tile [V] |
| 6 | Layout & composition | 5.0 | **5.0** | Medium-High | Control uses the canvas well; ops-role pages and forms are stretched mobile columns [V] |
| 7 | Component quality | 6.5 | **6.5** | Medium | Solid primitives; duplicated families [C] |
| 8 | Navigation presentation | 6.0 | **6.0** | Medium | Control sidebar strong [V] but its group labels measure 2.61:1 [M] |
| 9 | Dashboard presentation | 5.0 | **5.0** | **Low** | Only skeletons/empty seen; structure sound [V/C] |
| 10 | Data density & scannability | 5.0 | **5.0** | **Low** | Table columns well chosen [C]; row actions are 24px-high 10px text buttons [C]; populated density never seen |
| 11 | Mobile visual quality | 6.5 | **6.0** | Medium | Safe areas and 44px nav good; **mobile KPI labels truncate to 2–3 characters on `/control/super-admin`, invoice header actions clipped, chip rows clip** [V]; chrome ≈24% of viewport [M] |
| 12 | Accessibility & responsive polish | 5.5 | **4.5** | High | **25.3% of rendered desktop text fails contrast** (sidebar group labels 2.61:1, role label 3.43:1) [M]; status badges fail [M]; light semantic fills fail [M]; 28px targets [C]; positives: no horizontal overflow in 88 captures [M], labelled icon buttons [C] |

**Unweighted mean: 5.5 / 10** (was 5.7). Dimensions 9–10 remain provisional (±1.5) until populated screens are captured.

## 3. Verified findings from the full screenshot review (new)
Evidence file names below refer to the reviewed capture set; only 26 of the 88 are committed under `screenshots/current/` (see `09-screen-coverage-matrix.md`); the rest are reproducible with `tools/capture-current.cjs`.

| ID | Finding | Evidence |
|---|---|---|
| V01 | Mobile `/control/super-admin`: KPI labels truncate to 2–3 characters ("OR G…", "TO T…", "AC TI…", "PL A…", "AU D…") | `mobile-control-super.png` [V] |
| V02 | Mobile admin KPI pills truncate labels ("UNASSIG…", "POD REVI…") | `mobile-admin-home/dash.png` [V] |
| V03 | Mobile Invoice Generator: header actions (Save Draft / PDF) clipped at the right edge; error toast overlays the header | `mobile-admin-invoice-new.png` [V] |
| V04 | Horizontal chip rows clip with no scroll affordance: Expenses ("Al…"), Control Jobs ("E…"), POD review ("Missing signat…"), Drivers ("No Link") | mobile captures [V] |
| V05 | Ops roles get **two different mobile shells**: hamburger header (Control pages) vs blue brand band + bottom nav (everything else) | mobile-control-* vs mobile-admin-* [V] |
| V06 | Two different super-admin dashboards exist (`/super-admin` and `/control/super-admin`) with different tiles and actions; super-admin Settings also contains a **Feature switches** card (missing from the first prototypes) | `desktop-super-dash`, `desktop-control-super`, `desktop-super-settings` [V] |
| V07 | Admin `/jobs` renders the driver-style "My Jobs" page with a "+" action | `desktop-admin-jobs.png` [V] |
| V08 | User-management filters wrap into three uneven rows on mobile (Admin, Control Admin, Super Users) | mobile captures [V] |
| V09 | Desktop forms (New Job, Invoice Generator) render as a ~half-width single column inside the mobile shell with a full-width bottom nav | `desktop-admin-job-new`, `desktop-admin-invoice-new` [V] |
| V10 | **Strength:** the ten Control pages share one KPI-chip + search + view-chip + card pattern and one skeleton style | `desktop-control-*` [V] |
| V11 | Expenses receipt icon (Expenses empty state **and** the Profile "Expenses" row) reads as a dollar sign in a £ app | `mobile-driver-expenses`, `desktop-driver-profile` [V] |
| V12 | Error toast: white on red measures ≈3.2–3.6:1 | rendered measurement [M] |
| V13 | Login family: dark glass; tracked-caps subtitles and footer visibly faint (**contrast not computed — indeterminate**); footer names the backend vendor | `login`, `forgot`, `welcome` [V] |
| V14 | `/portal/*` redirects to the driver home for non-portal users, so the customer portal was **never seen** | capture log [M] |

## 4. Measured defects
**4.1 Status badges — `src/lib/statusConfig.ts` [M].** White text on: NEW `#007AFF` 4.02 · DRAFT/INCOMPLETE `#8E8E93` 3.26 · READY/ASSIGNED `#34C759` **2.22** · IN PROGRESS `#FF9500` **2.20** · CANCELLED `#FF3B30` 3.55 · COMPLETED `#5856D6` 5.65 (only pass). Needs 4.5. Presentation fix only; status keys, labels and `ADMIN_TRANSITIONS` untouched.

**4.2 Light-mode semantic tokens — `src/index.css` [M].** White on `--warning` 2.14, `--success` 3.35, `--destructive` 3.76; `--muted-foreground` on `--muted` 4.41; `--input` (border token) 1.2:1 vs white.

**4.3 Rendered current-UI contrast and size [M].** Desktop: 863 text nodes, 222 (25.7%) < 12px, 218 (25.3%) fail contrast. Mobile: 600 nodes, 155 (25.8%) < 12px, 26 (4.3%) fail. Worst: Control sidebar group labels 2.61:1, "⌘K" 2.32:1, sidebar subtitle/"Back to App" 3.30:1, role label (`text-white/60`) 3.43:1. See `12-contrast-and-text-verification.md`.

**4.4 Sub-12px text by context [M].** 383 uses of `text-[8–11px]`; by context: captions 100, uppercase micro-labels 70, badges 63, form helpers 28, button labels 28, other 81, numeric 7, table 5, nav 1. Handle by context (see `12-…`).

**4.5 Mobile chrome [M].** ≈145px top (brand band + breadcrumb + page header) + ≈61px bottom nav ≈ **24% of 844px** on `/jobs`.

**4.6 Touch targets [C].** `h-7 w-7` icon buttons (`DetailPanel`, `ControlClients`, `JobMasterList` ×2); row actions are `h-6 text-[10px]` (≈24px high). Primary nav, back button, CTAs meet 44px.

**4.7 No overflow [M].** `scrollWidth > clientWidth` false in all 88 captures.

**4.8 Fonts [M].** No typeface declared anywhere; see `13-…`.

## 5. Issue register (all items traceable)
Severity H/M/L · Effort XS/S/M/L (relative) · Expected improvement qualitative only. Class = evidence class.

| ID | Screens | Source | Issue | Class | Sev | Conf | Effort | Expected improvement |
|---|---|---|---|---|---|---|---|---|
| U01 | all job lists/cards/detail | `statusConfig.ts` | Status badges fail AA (2.20–4.02) | M | H | High | S | legible status everywhere |
| U02 | anywhere using solid success/warning/destructive | `index.css` | Light semantic fills + white text fail AA; `--input` border 1.2:1 | M | H | High | S | legible alerts/buttons; visible input edges |
| U03 | `/`, `/admin`, `/super-admin` (desktop) | `Dashboard.tsx`, `AdminDashboard.tsx`, `SuperAdminDashboard.tsx`, `BottomNav.tsx`, `AppHeader.tsx` | Mobile shell stretched on desktop | V | H | High | M | one desktop composition for ops roles |
| U04 | `/admin/users` | `AdminUsers.tsx` | No shell | V | M | High | S | consistent navigation |
| U05 | login family | `Login.tsx`, `ForgotPassword.tsx`, `Welcome.tsx` | Dark glass unlike app; faint secondary text | V | M | High (look) / indeterminate (contrast) | M | consistent first impression |
| U06 | many | multiple | 383 sub-12px uses (25.7% of rendered desktop text) | M | M | High | M | readability outdoors |
| U07 | `/control` | `ControlOverview.tsx`, `KpiStrip.tsx` | 7 tiles in 6 columns → orphan | V | L | High | XS | cleaner first screen |
| U08 | mobile pages | `AppHeader.tsx`, `Breadcrumbs.tsx` | 3 header bands, ≈24% chrome | M | M | High | S | more content above the fold |
| U09 | dashboards | `KpiPill`, `KpiStrip`, `MetricBlock`, `DashboardCard`, `LauncherCard` | Overlapping component families | C | M | Med | M | one metric component |
| U10 | uploads, ID card, permissions | see §4 | Raw palette colours bypass tokens | M | L-M | High | S | theme-safe colours |
| U11 | app-wide | `AppHeader.tsx:35`, `index.css`, `index.html` | 3 brand blues | M | L | High | XS | one brand token |
| U12 | expenses, profile | `Expenses.tsx:209`, profile row | Receipt icon reads as "$" | V | L | Med | XS | currency-appropriate icon |
| U13 | mobile chip rows | Expenses, Control Jobs/POD/Drivers | Clipped chips, no affordance (V04) | V | M | High | XS | discoverable filters |
| U14 | admin/control | §4.6 | 28px / 24px-high touch targets | C | M | High | XS | reliable taps |
| U15 | link previews | `index.html` | Third-party placeholder `og:image`/`twitter:site` | C | L | High | XS | branded previews |
| U16 | app-wide | `index.css`, `tailwind.config.ts`, `index.html` | No typeface declared | M | M | High | S | consistent type, tabular numerals |
| U17 | `/control/super-admin` mobile | `ControlSuperAdmin.tsx`, `KpiStrip.tsx` | KPI labels truncate to 2–3 chars (V01) | V | H | High | XS | readable KPIs |
| U18 | admin mobile | `AdminDashboard.tsx`, `KpiPill.tsx` | KPI pill labels truncate (V02) | V | M | High | XS | readable KPIs |
| U19 | invoice generator mobile | `InvoiceGenerator.tsx` | Header actions clipped (V03) | V | M | High | XS | reachable actions |
| U20 | ops roles, mobile | `ControlLayout.tsx` vs `AppHeader`/`BottomNav` | Two mobile shells (V05) | V | M | High | M | one mobile shell |
| U21 | `/super-admin` vs `/control/super-admin` | both dashboards | Two dashboards, different content (V06) | V | M | High | M (presentation only) | one presentation; **merging them is out of scope** |
| U22 | user management, mobile | `AdminUsers.tsx`, Control Admin, Super Users | Filters wrap unevenly (V08) | V | L | High | XS | tidy filter bar |
| U23 | desktop forms | `JobForm.tsx`, `InvoiceGenerator.tsx` | Narrow single column in mobile shell (V09) | V | M | High | M | desktop-appropriate forms |
| U24 | Control chrome | `ControlSidebar.tsx`, top bar | Sidebar group labels 2.61:1, "⌘K" 2.32:1, subtitle 3.30:1 | M | H | High | XS | legible navigation |
| U25 | brand band | `AppHeader.tsx` | Role label `text-white/60` 3.43:1 at 11px | M | M | High | XS | legible role |
| U26 | toasts | `ui/toast.tsx` | White on red ≈3.2–3.6:1 | M | M | High | XS | legible errors |
| U27 | row actions | `JobsColumns.tsx`, `ControlOverview.tsx` | `h-6 text-[10px]` text buttons | C | M | High | S | usable actions |
| U28 | admin `/jobs` | `JobList.tsx` | Admin sees driver-style "My Jobs" (V07) — **content/role design; observation only, not proposed** | V | L | Med | n/a | — |

## 6. What already meets a high standard
Control shell structure (V10) · consistent skeletons · bottom-nav 44px targets and safe areas · labelled icon buttons (spot-checked 9/9) · `UKPlate` · documented dark-mode contrast fixes · no horizontal overflow in 88 captures · an existing `ui-kit/` folder.

## 7. Unsupported or unverified claims (self-audit)
- Dimensions 9–10 and all "populated" quality claims are unverified for the *current* app.
- Portal, real inspection steps, real photo grids, POD report and `FeatureFlagsCard` contents were never rendered.
- Login-family contrast is indeterminate; "faint" is visual judgement.
- Rendered contrast figures come from skeleton/empty states.
- Status-badge contrast is token arithmetic; the real badges were not seen populated.
- All screenshots render in Inter, not the devices' fonts.

---
## Route inventory (46 route groups)

Coverage = classification of the screenshot(s) for the route, from `09-screen-coverage-matrix.md` (all 88 screenshots were reviewed; **no populated-data screen exists**). Packaged PNGs are only those needed for comparison; the rest are reproducible with `tools/capture-current.cjs` and are listed in the matrix.

| # | Route | Screen | Source files | Roles | Existing pattern | Current visual issues | Proposed UI-only improvement | Evidence | Coverage |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/login` | Login | src/pages/Login.tsx | Anon | Centered glass card on dark gradient | Different visual language from the rest of the app (dark/glass vs light enterprise); footer + tagline low contrast | Align to light brand surface or token-based dark theme; raise footer/tagline contrast | `current/desktop-login.png`, `current/mobile-login.png` | Fully visually assessed |
| 2 | `/forgot-password` | Forgot password | src/pages/ForgotPassword.tsx | Anon | Same dark glass card | Same as Login | Same tokens as Login | capture log (PNG not packaged) | Fully visually assessed |
| 3 | `/reset-password` | Reset password | src/pages/ResetPassword.tsx | Anon (token) | Same dark glass card | Same as Login | Same tokens as Login | source only | Code-inferred only (not captured) |
| 4 | `/welcome` | Welcome / activation | src/pages/Welcome.tsx | Invited user | Dark glass card | Same as Login | Same tokens as Login | capture log (PNG not packaged) | Fully visually assessed |
| 5 | `*` | Not found (404) | src/pages/NotFound.tsx | All | Centered message + bottom nav | Functional, minimal | Use shared empty/error state component | capture log (PNG not packaged) | Fully visually assessed |
| 6 | `/` | Home (driver launcher / ops dashboard) | src/pages/Dashboard.tsx; components/KpiPill.tsx; DashboardCard.tsx | Driver; Admin; Super-admin | Mobile shell: blue banner, breadcrumb, title, KPI pills, bottom nav | Admin/super-admin get a 744px mobile column inside a 1440px viewport with full-width bottom nav (verified) | Route ops roles to the Control shell presentation (sidebar, 2-column grid); keep driver launcher | `current/mobile-driver-home.png` | Loading/empty/error state only |
| 7 | `/jobs` | Jobs list (driver "My Jobs") | src/pages/JobList.tsx; components/DriverJobCard.tsx; JobCard.tsx | Driver; Admin | Card list under 3 stacked header bands; admins see the same driver-style "My Jobs" page with a "+" action (verified) | Header chrome ~145px top + ~61px bottom nav = ~24% of an 844px viewport (measured); status badge contrast | Collapse breadcrumb band on mobile; tinted status badges | `current/mobile-driver-jobs.png` | Loading/empty/error state only |
| 8 | `/jobs/master` | Job master list | src/pages/JobMasterList.tsx | Admin | Reorderable list, 28px icon buttons | 28px move up/down buttons under 44px touch minimum | Enlarge hit areas to 44px without changing icon size | capture log (PNG not packaged) | Partially assessed |
| 9 | `/jobs/new` | New job form | src/pages/JobForm.tsx | Admin | Long single-column form | Not verifiable populated; labels/sections code-inferred | Section cards, sticky action bar, field grouping | `current/desktop-admin-job-new.png` | Fully visually assessed |
| 10 | `/jobs/:jobId/edit` | Edit job form | src/pages/JobForm.tsx | Admin | Same as New job | Same | Same | source only | Code-inferred only (not captured) |
| 11 | `/jobs/completed` | Completed jobs | src/pages/CompletedJobs.tsx | Driver; Admin | Card list | Same header-stack issue | Shared list-row pattern | capture log (PNG not packaged) | Loading/empty/error state only |
| 12 | `/jobs/pending` | Pending jobs | src/pages/PendingJobs.tsx | Driver; Admin | Card list | Not captured | Shared list-row pattern | source only | Code-inferred only (not captured) |
| 13 | `/jobs/:jobId` | Job detail | src/pages/JobDetail.tsx | Driver; Admin | Stacked Section cards (Collect From / Deliver To / Inspections / QR / Notes / Evidence Health / Photos) | Section labels are muted grey 14px; real job not renderable offline | Concept mock 3: address cards with A/B pins, status+plate header, sticky CTA | `current/mobile-driver-job-detail.png` | Loading/empty/error state only |
| 14 | `/jobs/:jobId/pod` | POD report | src/pages/PodReport.tsx (1,089 lines) | Admin; Driver | Long report/print layout | Not captured; large file with 8 sub-12px text uses | Typographic scale + print-safe tokens | source only | Code-inferred only (not captured) |
| 15 | `/inspection/:jobId/:inspectionType` | Vehicle inspection flow (pickup 6 steps, delivery 5) | src/pages/InspectionFlow.tsx; features/inspection/inspectionFormConfig.ts | Driver | Wizard: odometer/fuel, checklist, damage, photos, signatures, review | Only a spinner could be captured; step UIs are code-inferred only | Concept mock 4: step bar, 52px inputs, segmented fuel level, photo grid states, sticky Back/Next | `current/mobile-driver-inspection.png` | Loading/empty/error state only |
| 16 | `/pending-uploads` | Pending uploads | src/pages/PendingUploads.tsx | Driver | List of queued submissions | Raw palette colours in QueuedSubmissionsSection (blue/orange/red-500 mixes) | Map to semantic tokens | capture log (PNG not packaged) | Loading/empty/error state only |
| 17 | `/profile` | Profile | src/pages/Profile.tsx | All | Form/card stack | Not verifiable populated | Shared form-field pattern | `current/desktop-driver-profile.png` | Partially assessed |
| 18 | `/profile/id` | Driver digital ID | src/features/onboarding/pages/DriverDigitalId.tsx; components/DriverIdCard.tsx | Driver | ID card | DriverIdCard has 12 sub-12px text uses and 9 raw palette colour uses | Token colours, 12px floor | source only | Code-inferred only (not captured) |
| 19 | `/expenses` | Expenses | src/pages/Expenses.tsx | Driver; Admin | Summary tile + chip filters + list | Empty-state icon reads as a dollar sign in a £ app; chip row clips ("Al") with no scroll affordance (verified) | Pound-based icon; fade/edge affordance on chip scroller | `current/mobile-driver-expenses.png` | Loading/empty/error state only |
| 20 | `/expenses/new, /expenses/:id/edit` | Expense form | src/pages/ExpenseForm.tsx | Driver; Admin | Form | Not captured | Shared form-field pattern | source only | Code-inferred only (not captured) |
| 21 | `/admin` | Admin dashboard | src/pages/AdminDashboard.tsx (742 lines) | Admin | Mobile shell, KPI pills, Needs Action / Stale Active / Awaiting Review, Management | Stretched mobile column on desktop (verified); 25 sub-12px text uses (highest in repo); mobile KPI labels truncate ("UNASSIG…", "POD REVI…") (verified) | Concept mock 5: two-column desktop layout in Control shell | `current/desktop-admin-dash.png` | Partially assessed |
| 22 | `/admin/users` | User management | src/pages/AdminUsers.tsx; features/users/components/* | Admin | Bare page: search, 3 filters, New User | No app shell/navigation at all on desktop; filters wrap into uneven rows on mobile (verified) | Wrap in shared shell; same filter-bar component as Jobs | `current/desktop-admin-users.png`, `current/mobile-admin-users.png` | Loading/empty/error state only |
| 23 | `/admin/timesheets` | Timesheets | src/pages/Timesheets.tsx | Admin | Mobile shell page | Mobile shell on desktop | Shared shell | capture log (PNG not packaged) | Partially assessed |
| 24 | `/admin/onboarding` | Admin onboarding | src/pages/AdminOnboarding.tsx | Admin | Mobile shell page | Same | Shared shell | capture log (PNG not packaged) | Partially assessed |
| 25 | `/admin/drivers/:userId (+/complete, /id)` | Driver profile / onboarding wizard | src/features/onboarding/pages/DriverProfileDetail.tsx; DriverOnboardingWizard.tsx | Admin | Detail + wizard | Not captured | Shared detail/wizard pattern | source only | Code-inferred only (not captured) |
| 26 | `/invoice/new(/:jobId)` | Invoice generator | src/pages/InvoiceGenerator.tsx | Admin | Form | Real form renders; error toast white-on-red ≈3.6:1; on mobile the header actions (Save Draft / PDF) are clipped at the right edge (verified) | Shared form + error presentation | `current/desktop-admin-invoice-new.png`, `current/mobile-admin-invoice-new.png` | Fully visually assessed |
| 27 | `/control` | Command Center | src/features/control/pages/ControlOverview.tsx; layouts/ControlLayout.tsx | Admin; Super-admin | Sidebar + ⌘K search + breadcrumb + KPI strip + sections | Strongest shell. KPI strip has 7 tiles in a 6-column grid → orphan tile on row 2 at 1440px (verified); breadcrumb duplicates sidebar context | Concept mock 1: 6-tile strip, section cards, same shell | `current/desktop-control-overview.png`, `current/mobile-control-overview.png` | Partially assessed |
| 28 | `/control/jobs` | Jobs (Control) | src/features/control/pages/ControlJobs.tsx; jobs/JobsColumns.tsx | Admin; Super-admin | KPI strip, search, 10 view chips, ResponsiveList table (Ref, Vehicle, Client, Driver, Route, Status, Updated) | Populated table not verifiable offline; 10 chips wrap on narrow desktop and clip on mobile | Concept mock 2: two-row toolbar, plate+model cell, tinted status badges | `current/desktop-control-jobs.png`, `current/mobile-control-jobs.png` | Partially assessed |
| 29 | `/control/pod-review` | POD review | src/features/control/pages/ControlPodReview.tsx | Admin | Queue list | 9 sub-12px uses; mobile chip row clips ("Missing signat…") | 12px floor; chip wrap/fade | capture log (PNG not packaged) | Partially assessed |
| 30 | `/control/drivers` | Drivers | src/features/control/pages/ControlDrivers.tsx | Admin | Table/cards | 13 sub-12px uses; mobile chip row clips ("No Link") | 12px floor; chip wrap/fade | capture log (PNG not packaged) | Partially assessed |
| 31 | `/control/compliance` | Compliance | src/features/control/pages/ControlCompliance.tsx | Admin | Table/cards | 12 sub-12px uses | 12px floor | capture log (PNG not packaged) | Partially assessed |
| 32 | `/control/finance` | Finance | src/features/control/pages/ControlFinance.tsx | Admin | KPIs + tables | 12 sub-12px uses | Tabular numerals, 12px floor | capture log (PNG not packaged) | Partially assessed |
| 33 | `/control/profitability` | Profitability | src/features/control/pages/ControlProfitability.tsx | Admin | KPIs + tables | Not verifiable populated | Chart/KPI tokens | capture log (PNG not packaged) | Partially assessed |
| 34 | `/control/clients(/link-jobs)` | Clients | src/features/control/pages/ControlClients.tsx; features/clients/pages/LinkJobsToClients.tsx | Admin | Table; 28px action button | 28px "Client actions" button | 44px hit area | capture log (PNG not packaged) | Partially assessed |
| 35 | `/control/invoice-prep` | Invoice prep | src/features/invoicing/pages/InvoicePrepScreen.tsx (991 lines) | Admin | Dense workflow screen | 11 sub-12px uses | Density mode + 12px floor | capture log (PNG not packaged) | Partially assessed |
| 36 | `/control/admin` | Control admin | src/features/control/pages/ControlAdmin.tsx | Admin | Settings-style cards | Not verifiable populated | Shared settings card | capture log (PNG not packaged) | Partially assessed |
| 37 | `/control/exports` | Exports | src/features/exports/pages/ExportsPage.tsx | Admin | Form/list | Not verifiable populated | Shared form + list | `current/desktop-control-exports.png` | Fully visually assessed |
| 38 | `/control/clients/:clientId (+/complete)` | Client profile / onboarding | src/features/onboarding/pages/ClientProfileDetail.tsx; ClientOnboardingWizard.tsx | Admin | Detail + wizard | Not captured | Shared detail/wizard pattern | source only | Code-inferred only (not captured) |
| 39 | `/super-admin` | Super-admin dashboard | src/pages/SuperAdminDashboard.tsx | Super-admin | Mobile shell: 2×2 tiles, Quick Actions, Recent Audit, Platform Management | Stretched mobile column on desktop with bottom nav (verified) | Concept mock 6 | `current/desktop-super-dash.png` | Partially assessed |
| 40 | `/super-admin/orgs|users|jobs|audit|errors|attention|settings` | Super-admin sub-pages (PageShell) | src/pages/SuperAdminPages.tsx (456 lines) | Super-admin | PageShell + Card lists; Settings = Identity & Role Model, Platform Controls | Same mobile shell; "Not yet available" outline badges | Concept mock 6 (settings panels) | `current/desktop-super-settings.png`, `current/mobile-super-settings.png` | Partially assessed |
| 41 | `/super-admin/orgs/:orgId (+/complete)` | Organisation profile / onboarding | src/features/onboarding/pages/OrganisationProfileDetail.tsx; OrganisationOnboardingWizard.tsx | Super-admin | Detail + wizard | Not captured | Shared detail/wizard pattern | source only | Code-inferred only (not captured) |
| 42 | `/control/super-admin` | Control: super-admin | src/features/control/pages/ControlSuperAdmin.tsx | Super-admin | Control shell page | 8 sub-12px uses; mobile KPI labels truncate to 2–3 characters ("OR G…", "TO T…") (verified) | 12px floor; label wrap rules | `current/desktop-control-super.png`, `current/mobile-control-super.png` | Partially assessed |
| 43 | `/portal, /portal/jobs/:id, /portal/invoices(/:id)` | Customer portal | src/features/portal/pages/*; portal layout | Portal user | Customer-facing job/invoice views | Redirected to / in review mode (PortalRoute requires portal role) → not visually verified | Reuse system tokens; verify with a portal test account | capture log (PNG not packaged) | Unavailable or inaccessible |
| 44 | `/confirm` | QR confirm | src/pages/QrConfirm.tsx | Receiver (public) | Public confirmation page | Not captured | Mobile-first confirm card | source only | Code-inferred only (not captured) |
| 45 | `/.lovable/oauth/consent` | OAuth consent | src/pages/OAuthConsent.tsx | Auth flow | Consent card | Not captured | Same tokens as Login | source only | Code-inferred only (not captured) |
| 46 | `/index, /admin/jobs, /admin/drivers, /admin/pod-review, /admin/finance` | Redirect routes | src/App.tsx; features/control/LegacyAdminRedirects.tsx | — | Redirects only | No UI | None | source only | n/a (redirect) |
