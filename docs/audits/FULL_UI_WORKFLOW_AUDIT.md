# Axentra — Full UI & Workflow Audit

Branch: `audit/full-ui-workflow-audit` · Base commit: `0dee585` · Started: 2026-07-13

This ledger is maintained in **Truth Mode**: a row is only marked "reviewed"
after the file was actually opened and read (static review) or the workflow
actually exercised (runtime review). Totals below are exact counts from the
repository, not estimates, and are updated as batches complete. Never read
"reviewed" as "defect-free" — see the per-batch findings sections and the
final report for what was actually verified.

---

## 0. Baseline (Phase 1)

Package manager: **npm** (CI uses `npm ci`; `bun.lock` also present and
committed but not used by CI — pre-existing, out of scope to remove per
"do not rewrite working systems merely for cleanliness").

| Command | Result |
| --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | ✅ 0 errors |
| `npm run lint` (`eslint .`) | ❌ 317 errors, 25 warnings (pre-existing backlog, dominated by `@typescript-eslint/no-explicit-any` in `supabase/functions/*`; not wired into CI — known from prior audit, unchanged in scope here) |
| `npx vitest run` | ✅ 44 files / 366 tests pass (baseline, before this audit's own test additions) |
| `npm run build` (`vite build`) | ✅ succeeds |
| `npm run release:validate` (static suites only — no `STAGING_*` configured) | ⚠️ WARNING overall (non-blocking); see below |

`release:validate` suite detail at baseline (before this audit's suite-05 fix,
commit `b23a4cb`):

| # | Suite | Result | Note |
| --- | --- | --- | --- |
| 01 Environment & configuration | ✅ PASS | |
| 02 Migration ordering & naming | ✅ PASS | 63 migrations |
| 03 Migration re-apply safety | ⚠️ WARNING | 3 policy renames flagged as "not re-runnable" — forward-safe per Supabase's migration tracking, not a real risk |
| 04 Rollback coverage | ✅ PASS | |
| 05 RLS / security-posture (static) | ⚠️ WARNING → **fixed to ✅ PASS in this audit** | see Defect DATA-001 below |
| 06 Edge-function authorization (static) | ⚠️ WARNING | `mcp` function has no auth check — flagged for Batch review, see below |
| 07 TypeScript type-check | ✅ PASS | |
| 08 Production build | ✅ PASS | |
| 09 Unit/regression tests | ✅ PASS | |
| 10 Committed-secret scan | ✅ PASS | |
| 11 Dependency vulnerability audit | ⚠️ WARNING | 1 high (vite/esbuild dev-server only, not exploitable in production build), 1 moderate — pre-existing, matches prior audit MED-4 |
| 12–15 (live DB/HTTP/realtime) | ⏭️ NOT_EXECUTED | no `STAGING_*` secrets in this environment — cannot be executed here, exactly as documented in `release-validation/README.md` |
| 16 ESLint ratchet | ⚠️ WARNING | mirrors the `npm run lint` backlog above |

**Pre-existing failures carried forward (not fixed by this audit unless noted):**
- 317 lint errors / 25 warnings — large, cross-cutting `any`-typing backlog; explicitly out of scope for "smallest safe correction" (would be a 90+ file behavior-risk refactor).
- 1 high + 1 moderate `npm audit` advisory — both trace to `vite`'s bundled `esbuild` dev-server, not exploitable in the shipped production build; a fix requires a major `vite` version bump (breaking-change surface), out of scope for this audit.
- Live security suites (12–15) cannot run without a provisioned staging Supabase project — **this audit did not and could not provision one**. Runtime RLS/cross-tenant/storage-IDOR/realtime claims below are backed by **static source review only** unless explicitly marked as executed.

---

## 1. Coverage totals (exact, ledger-backed)

| Metric | Count |
| --- | --- |
| Routes declared in `App.tsx` (`<Route>` elements, incl. nested `/control/*`) | 56 |
| Top-level pages (`src/pages/*.tsx`) | 31 |
| Feature-module directories (`src/features/*`) | 10 |
| Feature-module files (`.ts`/`.tsx`, excluding tests) | 88 |
| Top-level custom components (`src/components/*.tsx`) | 31 |
| shadcn/ui primitives (`src/components/ui/*.tsx`) | 42 (vendored; counted, not individually row-audited unless a defect surfaces) |
| Top-level hooks (`src/hooks/*.ts`) | 19 |
| Top-level lib modules (`src/lib/*.ts`) | 58 |
| Supabase edge functions | 14 |
| Supabase migrations | 63 |
| Existing automated test files (baseline) | 45 (after suite-05 fix) |

**Running audit totals** (updated after every batch — do not read ahead of the
batch sections below for current values):

| Metric | Value |
| --- | --- |
| Components/modules reviewed (static) | see per-batch sections |
| Components/modules runtime-tested | see per-batch sections |
| Routes exercised at runtime | see per-batch sections |
| Workflows exercised end-to-end | see per-batch sections |
| Defects found | see Defect Ledger |
| Defects fixed | see Defect Ledger |
| Defects remaining | see Defect Ledger |

> No claim of "all components checked" is made anywhere in this document
> without a corresponding row in the tables below.

---

## 2. Route inventory

| Route | Page component | Guard | Role | Purpose |
| --- | --- | --- | --- | --- |
| `/login` | `Login` | public | anon | Sign in |
| `/index` | redirect → `/` | public | anon | Legacy alias |
| `/forgot-password` | `ForgotPassword` | public | anon | Password reset request |
| `/reset-password` | `ResetPassword` | public | anon | Password reset completion |
| `/confirm` | `QrConfirm` | public | anon | QR handover confirmation (token-scoped RPCs only) |
| `/.lovable/oauth/consent` | `OAuthConsent` | public | anon | Lovable platform OAuth consent |
| `/` | `Dashboard` | ProtectedRoute | any authenticated | Driver home / KPIs |
| `/jobs` | `JobList` | ProtectedRoute | any authenticated | Driver job list |
| `/jobs/master` | `JobMasterList` | Protected+Admin | admin | Master job list, archive/restore |
| `/jobs/new` | `JobForm` | Protected+Admin | admin | Create job |
| `/jobs/completed` | `CompletedJobs` | ProtectedRoute | any authenticated | Completed jobs |
| `/jobs/pending` | `PendingJobs` | ProtectedRoute | any authenticated | Pending jobs |
| `/jobs/:jobId` | `JobDetail` | ProtectedRoute | any authenticated | Job detail |
| `/jobs/:jobId/edit` | `JobForm` | Protected+Admin | admin | Edit job |
| `/jobs/:jobId/pod` | `PodReport` | ProtectedRoute | any authenticated | POD report view |
| `/inspection/:jobId/:inspectionType` | `InspectionFlow` | ProtectedRoute | any authenticated | Pickup/delivery inspection |
| `/pending-uploads` | `PendingUploads` | ProtectedRoute | any authenticated | Offline queue status |
| `/profile` | `Profile` | ProtectedRoute | any authenticated | User profile |
| `/expenses` | `Expenses` | ProtectedRoute | any authenticated | Expense list |
| `/expenses/new` | `ExpenseForm` | ProtectedRoute | any authenticated | Add expense |
| `/expenses/:expenseId/edit` | `ExpenseForm` | ProtectedRoute | any authenticated | Edit expense |
| `/admin` | `AdminDashboard` | Protected+Admin | admin | Admin home |
| `/admin/jobs` | `AdminJobsQueue` | Protected+Admin | admin | Mobile-first admin job queues |
| `/admin/timesheets` | `Timesheets` | Protected+Admin | admin | Timesheets |
| `/admin/users` | `AdminUsers` | Protected+Admin | admin | User management |
| `/admin/drivers` | `AdminDrivers` | Protected+Admin | admin | Driver management |
| `/admin/pod-review` | `AdminPodReview` | Protected+Admin | admin | Mobile POD review |
| `/admin/finance` | `AdminFinance` | Protected+Admin | admin | Admin finance |
| `/admin/onboarding` | `AdminOnboarding` | Protected+Admin | admin | Onboarding hub |
| `/admin/drivers/:userId` | `DriverProfileDetail` | Protected+Admin | admin | Driver profile |
| `/admin/drivers/:userId/complete` | `DriverOnboardingWizard` | Protected+Admin | admin | Complete driver onboarding |
| `/control/clients/:clientId` | `ClientProfileDetail` | Protected+Admin | admin | Client profile |
| `/control/clients/:clientId/complete` | `ClientOnboardingWizard` | Protected+Admin | admin | Complete client onboarding |
| `/super-admin/orgs/:orgId` | `OrganisationProfileDetail` | Protected+SuperAdmin | superadmin | Org profile |
| `/super-admin/orgs/:orgId/complete` | `OrganisationOnboardingWizard` | Protected+SuperAdmin | superadmin | Complete org onboarding |
| `/super-admin` | `SuperAdminDashboard` | Protected+SuperAdmin | superadmin | Super-admin home |
| `/super-admin/orgs` | `SuperAdminOrgs` | Protected+SuperAdmin | superadmin | Org list |
| `/super-admin/users` | `SuperAdminUsers` | Protected+SuperAdmin | superadmin | Cross-org user list |
| `/super-admin/jobs` | `SuperAdminJobs` | Protected+SuperAdmin | superadmin | Cross-org job list |
| `/super-admin/audit` | `SuperAdminAudit` | Protected+SuperAdmin | superadmin | Audit log |
| `/super-admin/errors` | `SuperAdminErrors` | Protected+SuperAdmin | superadmin | Error log |
| `/super-admin/attention` | `SuperAdminAttention` | Protected+SuperAdmin | superadmin | Cross-org exceptions |
| `/super-admin/settings` | `SuperAdminSettings` | Protected+SuperAdmin | superadmin | Platform settings |
| `/invoice/new`, `/invoice/new/:jobId` | `InvoiceGenerator` | Protected+Admin | admin | Invoice generation |
| `/control` (index) | `ControlOverview` | ControlRoute | admin | Command Center home |
| `/control/jobs` | `ControlJobs` | ControlRoute | admin | Desktop job board |
| `/control/pod-review` | `ControlPodReview` | ControlRoute | admin | Desktop POD review (audited/fixed in prior session, PRs #35/#36) |
| `/control/drivers` | `ControlDrivers` | ControlRoute | admin | Desktop driver management |
| `/control/compliance` | `ControlCompliance` | ControlRoute | admin | Compliance alerts |
| `/control/finance` | `ControlFinance` | ControlRoute | admin | Desktop finance |
| `/control/clients` | `ControlClients` | ControlRoute | admin | Client list |
| `/control/invoice-prep` | `InvoicePrepScreen` | ControlRoute | admin | Invoice prep |
| `/control/admin` | `ControlAdmin` | ControlRoute | admin | Admin settings |
| `/control/exports` | `ExportsPage` | ControlRoute | admin | CSV exports |
| `/control/super-admin` | `ControlSuperAdmin` | ControlRoute(SUPERADMIN) | superadmin | Desktop super-admin (audited/fixed in prior session, PR #37 touches its data source) |
| `*` | `NotFound` | public | anon | 404 |

**Route review status:** 0/56 runtime-executed in this document as of Phase 2
(no browser session run yet — see Batch sections for actual runtime evidence
as it is gathered). Static review (source read) coverage is tracked per batch.

---

## 3. Defect ledger

| ID | Severity | Area | Summary | Status |
| --- | --- | --- | --- | --- |
| DATA-001 | P2 | `release-validation` tooling | Suite 05's RLS static checks for `qr_confirmations` and `vehicle-photos` did a blanket "phrase appears anywhere in migration history" scan, permanently reporting both as unresolved even after later migrations closed them. Root cause: no "latest state" resolution (unlike the adjacent helper-function check). **Fixed** in commit `b23a4cb`: replays CREATE/DROP lifecycle in chronological order; added 5-case regression test (`src/test/release-validation-suite-05.test.ts`). | ✅ Fixed, commit `b23a4cb` |
| WORKFLOW-001 | P1 | Auth / route guards | `/control/*` (Command Center — dispatch, POD review, finance, driver management, super-admin panel) is guarded solely by `ControlRoute`; it is not nested inside `ProtectedRoute` (unlike every other authenticated route). `ControlRoute` checked only `isAdmin`/`isSuperAdmin` and never checked `user.accountStatus`, so a **suspended** or **pending_activation** admin — fully blocked from `/admin/*` and `/jobs/*` by `ProtectedRoute` — retained complete, unrestricted access to the entire Command Center. Root cause: `ControlRoute` was written as a parallel reimplementation of `ProtectedRoute`'s auth/loading/redirect logic and the account-status block was omitted. Reproduced by static trace of `App.tsx`'s route table (confirmed `/control` and `/control/super-admin` are the only two route trees not wrapped in `ProtectedRoute`) and by direct inspection of `ControlRoute.tsx`'s guard conditions. **Fix**: extracted the suspended/pending block into a shared `AccountStatusGate` component (`src/components/AccountStatusGate.tsx`) and added the same check to `ControlRoute`, so the two guards can no longer drift independently. Regression test: `src/test/control-route-guard.test.tsx` (4 cases) + `src/test/account-status-gate.test.tsx` (5 cases). | ✅ Fixed, commit pending (this batch) |
| WORKFLOW-002 | P2 | Driver onboarding gate | `useDriverGate()` (blocks drivers whose onboarding is `no_profile`/`onboarding`/`rejected` from functional access) is only enforced by rendering `<DriverGateScreen>` on the Dashboard route (`/`). `JobDetail`, `InspectionFlow`, `PodReport`, `PendingUploads`, and `ExpenseForm` never call `useDriverGate()` at all — confirmed by grep across all consumers. A driver in `rejected` or `onboarding` status who already has a `driver_profiles` row (e.g., a job was assigned to them before their onboarding was rejected) can still directly navigate to `/jobs/:jobId` or `/inspection/:jobId/:type` (e.g., via browser history) and complete a real pickup/delivery inspection — the exact "gated drivers should not navigate freely" invariant `DriverGateScreen`'s own header comment states. RLS still scopes data by organisation (no cross-org leak), so this is a workflow-completeness gap, not a tenancy breach. **Deferred to Batch 2 (driver dashboard/job navigation) and Batch 4 (pickup inspection)**, where these pages are reviewed in depth and the fix can be verified against the full navigation/inspection flow rather than in isolation. | 🔶 Found, fix deferred to Batch 2/4 |

Further defects are appended here as each batch (Section 4) verifies and fixes
them, using the categories UI-###, LOGIC-###, WORKFLOW-###, DATA-###, A11Y-###,
SECURITY-### per severity P0–P3.

---

## 4. Batch tracking

Each batch below will be filled in as it is executed — mapped execution path,
files reviewed, defects found/fixed, tests added, commands run, commit hash.
Batches are executed in the fixed order specified for this audit; a batch is
not started until the previous one has no known unresolved critical breakage.

1. Authentication and protected routing — **done**
   - Files statically reviewed: `src/context/AuthContext.tsx`, `src/App.tsx` (`ProtectedRoute`/`AdminRoute`/`SuperAdminRoute`), `src/features/control/guards/ControlRoute.tsx`, `src/pages/Login.tsx`, `src/hooks/useDriverGate.ts`, `src/components/DriverGateScreen.tsx`, `src/lib/logger.ts`.
   - Execution path traced: every `<Route>` in `App.tsx` cross-checked for guard wrapping (56 routes; confirmed exactly two — `/control`, `/control/super-admin` — rely on `ControlRoute` alone rather than `ProtectedRoute`).
   - Role-derivation logic (`hasRoleCheck`, `isAdminDriverCheck`, JWT-metadata independence) re-verified against `AuthContext.tsx` source: privileged roles (`ADMIN`/`SUPERADMIN`) are added only from `user_profiles.role`, never trusted from JWT/user metadata — matches the static RLS posture from suite 05/06.
   - Login flow reviewed: open-redirect guard on `?next=` param (rejects protocol-relative `//`) is present and correct; submit button is disabled while in flight (double-submission risk low, not reproduced at runtime — no live backend in this environment).
   - Defects found: WORKFLOW-001 (P1, fixed), WORKFLOW-002 (P2, found — fix deferred to Batch 2/4, see Defect Ledger).
   - Tests added: `src/test/control-route-guard.test.tsx` (4 tests), `src/test/account-status-gate.test.tsx` (5 tests).
   - Commands run: `tsc --noEmit` ✅, `eslint` (changed files) ✅ 0 errors, `vitest run` ✅ 47 files/380 tests, `vite build` ✅.
   - Not executed (declared honestly): no live Supabase project in this environment, so actual login, session-expiry, and RLS enforcement were **not** exercised end-to-end against a real backend — only the client-side guard logic was statically verified and unit-tested with mocked auth state.
   - Commit: (recorded after this batch's commit below).
2. Driver dashboard and job navigation — pending
3. Job creation, assignment and editing — pending
4. Pickup inspection — pending
5. Delivery inspection — pending
6. Evidence capture and uploads — pending
7. Offline queue and retry behaviour — pending
8. POD generation and review — pending
9. Admin dashboard and review workflows — pending
10. Expenses, finance and invoicing — pending
11. Control Centre and super-admin functionality — pending
12. Shared components and global responsive behaviour — pending
13. Accessibility — pending
14. Error, loading and empty states — pending

---

## 5. Known constraints of this environment (declared up front, Truth Mode)

- **No staging Supabase project.** Live suites 12–15 and any runtime RLS/org-isolation/storage-IDOR proof cannot be executed here. All security conclusions about the database layer are **static source review**, not runtime proof, unless a batch section explicitly states otherwise.
- **No physical devices.** Viewport testing uses Chromium (Playwright, pre-installed) resized to the specified breakpoints — this validates CSS/layout behavior, not real touch input, on-device keyboards, or native camera capture.
- **No production data access.** No production database, production Supabase project, or production secrets are touched at any point.
