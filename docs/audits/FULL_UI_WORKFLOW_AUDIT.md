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
| WORKFLOW-002 | P2 | Driver onboarding gate | `useDriverGate()` (blocks drivers whose onboarding is `no_profile`/`onboarding`/`rejected` from functional access) was only enforced by rendering `<DriverGateScreen>` on the Dashboard route (`/`). `JobDetail`, `InspectionFlow`, `PodReport`, `PendingUploads`, and `ExpenseForm` never called `useDriverGate()` at all. Worse: `JobList.tsx`'s own driver-scoping filter (`gate.isDriverOnly && gate.driverProfileId ? jobs.filter(...) : jobs`) silently returns the **entire unfiltered org job list** for a `no_profile` driver, since `driverProfileId` is `null` there and `isDriverOnly && null` is falsy — so a gated driver reaching `/jobs` directly would see every other driver's active jobs in the org, not just their own. **Fix**: centralised the check inside `ProtectedRoute` itself (`src/App.tsx`), which already wraps every driver-reachable route — a `DriverOnboardingGate` wrapper calls `useDriverGate()` once and blocks with the same loading/gate-screen behaviour Dashboard already had. This is a no-op for admins/superadmins: the underlying query only runs when `isDriverOnly`. Regression test: `src/test/protected-route-driver-gate.test.tsx` (6 cases, including "never blocks an admin"). | ✅ Fixed, commit pending (this batch) |
| UI-001 | P2 | `JobDetail.tsx` loading/error state | `useJob()`'s query throws (Supabase `.single()` returns an error for 0 matching rows — either a genuinely invalid job id or one RLS silently denies) rather than resolving to `null`. `JobDetail` destructured only `{ data: job, isLoading }` and used `isLoading \|\| !job` as its sole loading/error condition — once the query settled into its error state (`isLoading: false`, `data: undefined`), the component kept rendering the loading skeleton **forever**, with no indication the job doesn't exist or isn't accessible, and no way out other than the header's back button. Reproduced by tracing `useJob` → `api.getJobWithRelations` → `supabase.from('jobs')...single()` → `if (jobRes.error) throw jobRes.error;`, confirming the query settles into `isError: true` rather than a falsy-but-successful result. **Fix**: destructure `isError` and render a proper "Job not found" state (with a back button) when `isError \|\| !job`, distinct from the loading state. Regression test: `src/test/job-detail-not-found.test.tsx` (3 cases: error state, in-flight loading, real data). | ✅ Fixed, commit pending (this batch) |
| WORKFLOW-003 | **P1** | `InspectionFlow.tsx` / `submit_inspection` RPC | Nothing — client or server — checked that the calling driver is the job's *assigned* driver before allowing pickup/delivery inspection actions. Confirmed at BOTH layers: (1) grepped `InspectionFlow.tsx` for any `driver_id`/assignment check — zero matches; (2) read the full `submit_inspection()` PL/pgSQL body (`supabase/migrations/20260713120000_submit_inspection_server_side_job_lock.sql`) — it reads `jobs.driver_id` (`v_driver_id`) *only* to check whether the caller already has a *different* job in progress (the `ACTIVE_JOB_LOCK` guard), never to authorise the caller against *this* job. Combined with `jobs_update_org`/`inspections`/`damage_items` RLS being scoped by **org**, not by assignee, any active, non-suspended driver in the same org could open `/inspection/:jobId/:type` for a job assigned to a *different* driver (or an unassigned job) and submit a full inspection — undermining the entire assignment/eligibility workflow (`AssignDriverModal`'s licence/onboarding compliance checks exist specifically to gate who should be doing this). Same-org only (RLS still blocks cross-org), so P1 not P0. **Fix (defense in depth, both layers)**: (a) server — new migration `20260713150000_submit_inspection_assigned_driver_only.sql`, `CREATE OR REPLACE` of `submit_inspection` adding one authorization check (reject unless caller `is_admin_or_super_admin()` or their `driver_profiles` row matches `jobs.driver_id`; an unassigned job rejects non-admins too) — byte-for-byte identical otherwise, with a matching `.down.sql`; (b) client — `InspectionFlow.tsx` fail-fast "Not your job" screen using the already-resolved `useDriverGate().driverProfileId`, before any evidence capture begins. **Not independently executed against a live database** (no staging environment in this session; see Section 5) — verified by careful static review and byte-for-byte diffing against the prior function body, not by running it. Regression test (client only): `src/test/inspection-flow-guards.test.tsx` (5 cases). | ✅ Fixed (client), migration written (server — **unverified against a live DB**), commit pending (this batch) |
| UI-002 | P2 | `InspectionFlow.tsx` loading/error state | Same root cause as UI-001, in the higher-stakes location: every field is read via `job?.` optional chaining, so for an invalid/inaccessible job id the *entire* multi-step form (odometer, checklist, damage capture with photos, signatures) rendered normally with blank vehicle info — the driver could complete the whole flow before failing only at final submit, wasting significant effort and creating confusing failures. **Fix**: same pattern as UI-001 — destructure `isError`, render "Job not found" before any step content. | ✅ Fixed, commit pending (this batch) |
| DATA-002 | P2 | `release-validation` tooling | Suites 02/03/04's "release set" detection was a **hardcoded date regex** (`/^2026062[89]/`, duplicated identically in three files) meant to mean "migrations not yet verified" — never bumped since the original Phase 1 release. Discovered while adding this batch's own migration: **10 pre-existing migrations since 2026-06-30 were silently never checked** by any of the three suites (ordering/idempotency/rollback-coverage), including three security/data-integrity-relevant ones. Experimentally widening the cutoff to test the theory surfaced three **real, previously-invisible gaps**: `20260712232500_pod_photos_private_org_scoped.sql` and `20260713120000_submit_inspection_server_side_job_lock.sql` had **no rollback file at all**, and `20260713140000_invoice_number_atomic_allocation_and_constraints.sql` had a `CREATE UNIQUE INDEX` with no `IF NOT EXISTS` guard (a partial-failure retry would error instead of no-op'ing). **Fix**: (1) extracted the cutoff into one shared, documented constant (`release-validation/lib/releaseSet.mjs`) so it only needs bumping in one place going forward; (2) wrote the two missing rollback files; (3) added `IF NOT EXISTS` directly to the still-unreleased `20260713140000` migration (chosen over a patch-migration: Supabase's migration ledger tracks applied state by filename/version, not content hash, so editing an unreleased migration — consistent with this repo's own "nothing here is deployed" documentation for its entire migration history — is lower-risk than a second migration that can never make the check itself pass). Regression test: `src/test/release-set.test.ts` (4 cases). | ✅ Fixed, commit pending (this batch) |
| WORKFLOW-004 | P2 | `InspectionFlow.tsx` / `submit_inspection` RPC | `submit_inspection()` reads `has_pickup_inspection` only to decide which terminal status a delivery submission lands on (`pod_ready` vs `delivery_complete`) — it never rejects a delivery submission when pickup was never done. The only gate is client-side: `JobDetail.derivePrimaryCta()` always routes to "Start Pickup" while `!hasPickup`, so "Start Delivery" is unreachable through the UI — but nothing stops a driver navigating directly to `/inspection/:jobId/delivery` (the same bypass vector as WORKFLOW-003) for a job whose status is e.g. still `ready_for_pickup` (not in `v_non_actionable_statuses`, so `JOB_NOT_ACTIONABLE` doesn't catch it either). Result: a job reaches `delivery_complete` with no collection-time odometer/fuel/damage/signature record at all. Admin review does surface a "No pickup insp." badge (not silently hidden), but the invalid transition itself was never blocked — a real operational/compliance gap for a vehicle logistics platform, not just a display quirk. **Fix (both layers, same pattern as WORKFLOW-003)**: new migration `20260713170000_delivery_requires_pickup_complete.sql` rejects a delivery submission when `has_pickup_inspection` is false, unless the caller is admin/super-admin (matching the existing admin-override convention — an admin may legitimately force a delivery-only completion, e.g. a vehicle already at the yard); client-side "Pickup not complete" fail-fast screen in `InspectionFlow.tsx` with a direct link to start pickup. **Same live-DB verification caveat as WORKFLOW-003** — static review + byte-for-byte diffing only. Regression test: 3 new cases added to `src/test/inspection-flow-guards.test.tsx` (8 total). | ✅ Fixed (client), migration written (server — **unverified against a live DB**), commit pending (this batch) |
| WORKFLOW-005 | **P1** | `pendingUploads.ts` + `evidence/evidenceStore.ts` + `submitQueue.ts` — all three offline queues | An item's persisted state is set to `"uploading"` immediately before the network upload starts. If the app crashes, is force-quit, the tab is closed, or an unexpected reload happens while that upload is genuinely in flight, the record is left frozen at `"uploading"` forever. Traced every path that could recover it: `retryUpload`'s guard explicitly refuses `state === "uploading"` (by design — a real, tested contract in `lifecycle-integrity.test.ts` guarding against racing a genuinely-active upload), `retryAllPending`'s target filter excludes it, and every focus/online/visibility/auto-retry trigger ultimately funnels through one of those. **No code path anywhere resets it.** The doc this codebase already has (`docs/security/EVIDENCE-PIPELINE-FIXES.md`) describes this exact scenario as already-fixed ("V2... loadAll re-arms them to ready"), and cites a regression test (`src/test/evidence-pipeline-fixes.test.ts`) that **does not exist in the current tree** — strong evidence the fix was lost in a later rewrite of this file (the state/status dual-field system, per-item blob-key storage, and run-id verification logic all look like substantial subsequent rewrites). The only user-facing recourse was Discard — permanently losing that evidence. The exact same defect (same root cause, same "queued/failed only" eligibility filter, no re-arm anywhere) exists independently in the newer, flag-gated `evidence/` v2 pipeline (`EVIDENCE_V2_ENABLED`, default OFF — zero current production exposure, but the code carries the same bug if the flag is ever turned on). **Fix (both pipelines)**: track when an item entered "uploading" (`uploadingStartedAt` — new field — for the legacy pipeline; the v2 pipeline already stamps `updatedAt` on every transition, so no new field was needed there) and re-arm to `"failed"` (retryable, not silently lost) if that exceeds a 5-minute threshold, on every `loadAll()`/`listPendingWork()` read — the same "auto-heal on every read" convention this codebase already uses for stale "staged" TTL purging. Deliberately generous threshold so it can never misfire against a genuinely slow-but-active upload within a live session. Regression tests: 4 new cases in `src/test/pending-uploads.test.ts` (17 total for the file) covering stuck-item re-arm, missing-timestamp legacy rows, leaving a genuinely recent upload alone, and confirming a re-armed item is actually retryable end-to-end; 3 new cases in `src/test/evidence-store.test.ts` (14 total). One of these new tests caught a real bug in the v2 pipeline's first draft of this fix (the in-memory return value wasn't kept in sync with what was persisted) before it shipped. **Batch 7 found the same root cause a third time**, in `submitQueue.ts` (the whole-inspection-submission offline queue, higher stakes than a single photo): `drainSubmitQueue`'s candidate filter excludes `status === "submitting"`, AND the Pending Uploads UI's Retry button is `disabled` whenever `item.status === "submitting"` — so a stuck entry was invisible to *both* automatic retry and the only manual retry affordance; Discard (losing the entire submission: inspection payload, damage items, signatures) was the sole path forward. Same fix applied: `submittingStartedAt` field + re-arm-on-load in `loadAllRaw()`. Regression tests: `src/test/submit-queue-stranded.test.ts` (5 new cases, new file — no prior test coverage existed for this module at all). | ✅ Fixed (all three pipelines), commit pending (this batch) |
| WORKFLOW-006 | **P1** | `complete_job` RPC | `complete_job()` (`supabase/migrations/20260422120617_cdf34bef-25ea-4ef7-ac13-c21126b3eeeb.sql`, lines 260-311) — the single authoritative server-side path that marks a job `completed` after POD review — has **no authorization check at all**, and never has since it was created. It validates only that the status transition is legal (`pod_ready`/`delivery_complete` → `completed`); it never checks who is calling it. The function is `SECURITY INVOKER` (runs under the caller's own RLS), and `jobs_update_org` (20260630100100) intentionally allows **any** org member to `UPDATE jobs` (drivers advance status via `submit_inspection`) — that reasoning never anticipated this third, separate status-changing path. Confirmed by reading the full function body and searching for any trigger/constraint that might additionally gate it (none exists, only timestamp-management triggers). Result: any authenticated driver could call `complete_job` directly via RPC for any of their org's `pod_ready`/`delivery_complete` jobs and mark it `completed` — completely bypassing the admin review step that `AdminPodReview.tsx`/`ControlPodReview.tsx`/`PodReport.tsx` exist to enforce. All three client call sites already correctly gate the "Confirm" action behind `isAdmin \|\| isSuperAdmin` client-side — the defect is purely a missing server-side mirror of an already-correct client gate (the same class of gap as WORKFLOW-003/004: client gates correctly, server had no matching check). **Fix**: new migration `20260713180000_complete_job_admin_only.sql`, `CREATE OR REPLACE` adding one check (reject unless caller `is_admin_or_super_admin()`) as the very first statement in the function body, before touching any row — mirrors the existing admin-only pattern already used for `jobs_insert_admin`/`jobs_delete_admin`. Byte-for-byte identical otherwise, with a matching `.down.sql`. Client-side `completeJobRpc` (`src/lib/api.ts`) also given a friendly error translation for the new `ADMIN_OR_SUPER_ADMIN_ONLY` code (matching the existing `INVALID_COMPLETION_TRANSITION` pattern); verified all three call sites' catch blocks already surface `e.message` via a destructive toast rather than swallowing it, so a legitimate rejection (defense-in-depth only — the button is never shown to non-admins) surfaces gracefully. **Same live-DB verification caveat as WORKFLOW-003/004** — static review + byte-for-byte diffing only, not executed against a live database (see Section 5). Regression test: `src/test/complete-job-rpc.test.ts` (4 cases, covering the RPC call shape and all three error-translation branches). | ✅ Fixed (client + migration written, server — **unverified against a live DB**), commit pending (this batch) |
| SECURITY-001 | **P1** | `driver_onboarding` table RLS + `onboarding-docs` storage | The original "Org members can manage onboarding" policy (`20260317100818`) was a single `FOR ALL` policy scoped only by `org_id = user_org_id()` — it applied to SELECT **and** INSERT/UPDATE/DELETE alike. Every write path in the app (`createOnboarding`/`updateOnboarding`/`reviewOnboarding` in `src/lib/onboardingApi.ts`) is only ever called from `AdminOnboarding.tsx`, an admin-only route (`AdminRoute`) — but nothing at the database layer enforced that. Any authenticated driver in the org could call `supabase.from('driver_onboarding').update({ status: 'approved', reviewed_by: <self>, reviewed_at: now() })` directly and **self-approve their own compliance record** — licence, right-to-work, document review — completely bypassing the admin review workflow this feature exists to enforce (the same class of gap as WORKFLOW-006, but in raw table RLS rather than an RPC). Separately, and worse: the `onboarding-docs` storage bucket's four policies (view/upload/update/delete) were scoped **only** by `auth.role() = 'authenticated'` — no org scoping at all, and the object path (`<onboardingId>/<docType>.<ext>`) carries no org prefix either — so any authenticated user in **any** org could view, overwrite, or delete another org's driver licence scans, proof-of-address, and right-to-work documents (cross-tenant PII exposure + evidence-tampering risk via the DELETE policy). **Fix**: new migration `20260713190000_driver_onboarding_admin_only_writes.sql` splits the table's FOR ALL policy into SELECT (admin sees all org records; a driver may still see their own record via `linked_user_id`/email match — the exact lookup `useDriverGate()` already performs client-side) and INSERT/UPDATE/DELETE (admin/super-admin only, org-scoped) — no legitimate call path is affected, since every write already only ever originated from the admin-only page. The storage policies are rewritten to join through `driver_onboarding.id` (the path's first segment) to resolve and check the owning org, mirroring the existing pod-photos/pod-pdfs org-scoped storage pattern. Paired `.down.sql` restores the original policies exactly. A new suite-05 (RLS static analysis) check was added so a future regression that reintroduces either permissive policy fails CI rather than going unnoticed. **Not verified against a live database** — static review only (see Section 5). Regression tests: 2 new cases in `src/test/release-validation-suite-05.test.ts` (7 total for the file) exercising the exact policy-name patterns the new suite-05 check uses. | ✅ Fixed (migration written — **unverified against a live DB**), commit pending (this batch) |
| SECURITY-002 | **P1** | `user-lifecycle` edge function — `set_permission_override` | The non-super-admin escalation guard read `if (permDef.is_sensitive && ["users.manage_permissions", "users.manage_admins", "platform.super_admin"].includes(permission_key))` — ANDing the data-driven `is_sensitive` flag with a hardcoded 3-key allowlist. `PermissionEditor.tsx`'s own comment and logic ("Non-super admins can't see sensitive permissions") filters the UI on `is_sensitive` alone, with no key list — so the two layers disagreed: any `is_sensitive` permission whose key wasn't one of those exact 3 strings was invisible in the UI but still settable by a plain admin via a direct API call to the edge function, a role-escalation gap matching the "client gates correctly, server didn't fully mirror it" pattern seen elsewhere in this audit. Traced by reading the full `set_permission_override` handler and comparing it line-by-line against the client's filter logic. **Fix**: extracted the check into a small pure function, `isSensitivePermissionBlockedForNonSuperAdmin()` (`supabase/functions/_shared/permissionEscalation.ts`, matching the existing `_shared/pathAuth.ts` convention for edge-function logic that needs vitest coverage), which gates on `is_sensitive` alone — dropping the redundant/contradictory key allowlist entirely. Regression test: `src/test/permission-escalation.test.ts` (2 cases). | ✅ Fixed, commit pending (this batch) |

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
2. Driver dashboard and job navigation — **done**
   - Files statically reviewed: `src/pages/Dashboard.tsx`, `src/pages/JobList.tsx`, `src/pages/JobDetail.tsx`, `src/hooks/useJobs.ts` (`useActiveJobs`/`useJob`), `src/lib/api.ts` (`getJobWithRelations`), `src/components/DriverJobCard.tsx`, `src/lib/executionRanking.ts`, `src/lib/driverJobSummary.ts`.
   - Execution path traced: driver-gate consumers found via grep (`Dashboard`, `Expenses`, `Profile`, `JobList`, `CompletedJobs`, `PendingJobs`); confirmed only `Dashboard` actually blocked rendering — the rest merely scope/filter.
   - Defects found: WORKFLOW-002 (P2, fixed — see above), UI-001 (P2, fixed — see above).
   - Tests added: `src/test/protected-route-driver-gate.test.tsx` (6 tests), `src/test/job-detail-not-found.test.tsx` (3 tests).
   - Commands run: `tsc --noEmit` ✅, `eslint` (changed files) — 0 new errors (20 pre-existing `no-explicit-any` errors in `JobDetail.tsx`, all on lines untouched by this batch's diff, confirmed by `git diff`), `vitest run` ✅ 49 files/389 tests, `vite build` ✅.
   - Not executed (declared honestly): no live backend, so the actual `getJobWithRelations` RLS-deny path (a real cross-driver/cross-org job id) was traced statically, not exercised against a live database; the "invalid job id" and "in-flight" states were exercised via mocked query results, not a real network round-trip.
   - Commit: (recorded after this batch's commit below).
3. Job creation, assignment and editing — **done, no code fix required**
   - Files statically reviewed: `src/pages/JobForm.tsx` (full: validation, submit, draft-save), `src/lib/api.ts` (`createJob`/`updateJob`/`adminChangeStatus`/`deleteJob`), `src/features/control/components/AssignDriverModal.tsx`, `supabase/functions/assign-driver/index.ts`, `supabase/migrations/20260630100100_phase1_jobs_write_scope_admin_only.sql`.
   - Verified findings (no fix needed — already correct):
     - Required-field validation rejects whitespace-only input (`.trim()` before falsy check on all 14 required fields); errors surface per-field via `<ErrorText>`.
     - Double-submission: both create and edit paths gate the submit button on `createMutation.isPending || updateMutation.isPending`.
     - Org-scoping on create/update/delete is enforced at the RLS layer (`jobs_insert_admin`, `jobs_update_org` with `WITH CHECK`, `jobs_delete_admin` — `supabase/migrations/20260630100100...sql`), not just client-side `<AdminRoute>`. Confirmed `WITH CHECK` on `jobs_update_org` prevents a driver from reassigning a job's `org_id` to a foreign org even via direct PostgREST calls.
     - `adminChangeStatus` validates the status transition against `ADMIN_ALLOWED_TRANSITIONS` before writing (defence in depth, matching the DB-side enforcement).
   - Observations (informational, not defects — see "Do not classify design preferences as defects"):
     - `AssignDriverModal`'s eligibility check (licence expiry, onboarding status) is a client-side nudge only — the actual write is a direct `supabase.from("jobs").update(...)` with no server-side re-validation of eligibility. Not classified as a defect: only an already-authenticated admin can reach this modal, so bypassing their own UI's guardrail is a self-directed judgment call (e.g. a deliberate emergency override), not a privilege escalation from a lower-trust actor.
     - The `jobs_update_org` RLS policy scopes by `org_id` only, not by column — a driver's own session can technically update any column (price, addresses, driver reassignment) on any job in their org via a raw API call, not just `status`. This is a **pre-existing, already-documented, deliberately-deferred** limitation (see the migration's own header comment: "Column-level protection... NOT attempted here"), not a new finding — noted for traceability, not re-litigated or fixed here (would require a trigger-based redesign out of this audit's scope).
   - **Carried forward to Batch 4**: grepped `InspectionFlow.tsx` for any check that the current driver is the job's *assigned* driver before allowing inspection actions — found **zero matches**. Any active driver in the same org can seemingly navigate to `/inspection/:jobId/:type` for a job assigned to a different driver and submit a full inspection. This needs full investigation (is this intentional "any driver can pick up any org job" behaviour, or a genuine accountability/data-integrity gap?) in Batch 4, where `InspectionFlow.tsx` is the primary subject.
   - Commands run: no code changed this batch, so no new verification run beyond Batch 2's already-green state; static review only.
   - Commit: none (no code change).
4. Pickup inspection — **done** (largest batch so far — surfaced a P1 finding and an audit-tooling drift issue)
   - Files statically reviewed (full read): `src/pages/InspectionFlow.tsx` (2200+ lines), `supabase/migrations/20260713120000_submit_inspection_server_side_job_lock.sql`, `supabase/migrations/20260629100000_fix_damage_items_replay_ordering.sql` (prior function body), `release-validation/suites/02-migration-order.mjs`, `release-validation/suites/03-migration-idempotency.mjs`, `release-validation/suites/04-rollback-coverage.mjs`.
   - Execution path traced: `/inspection/:jobId/:type` → `InspectionFlow` → `useJob`/`useDriverGate` → `useSubmitInspection` → `api.submitInspection` → `submit_inspection` RPC → `jobs`/`inspections`/`damage_items` tables, cross-checked against `jobs_update_org`/RLS scoping (org, not assignee).
   - Defects found: WORKFLOW-003 (**P1**, fixed client + server migration written, **server fix unverified against a live DB**), UI-002 (P2, fixed), DATA-002 (P2, fixed — release-validation tooling drift, surfaced 2 missing rollbacks + 1 non-idempotent index in already-merged migrations, both fixed).
   - Tests added: `src/test/inspection-flow-guards.test.tsx` (5 tests), `src/test/release-set.test.ts` (4 tests).
   - Commands run: `tsc --noEmit` ✅, `eslint` (changed files) — 0 new errors (all flagged lines pre-existing, confirmed via `git diff` hunk ranges), `vitest run` ✅ 50 files/394 tests, `vite build` ✅, `npm run release:validate` (full) ✅ — 01/02/04/05/07/08/09/10 PASS, 03/06/11/16 non-blocking WARNING, 12–15 NOT_EXECUTED (no staging env), **overall WARNING (non-blocking), exit 0**.
   - **Explicitly attempted and could not complete**: tried to spin up a throwaway local PostgreSQL (binaries present in this environment) to actually execute the new `submit_inspection` authorization check against fixture data rather than rely on static review alone. Blocked by the environment's own safety controls when the attempt required creating a new OS-level user account or modifying shared `/tmp` permissions to work around directory-ownership restrictions — correctly refused as out of scope for this audit, so **the server-side SQL fix is verified by careful static review and byte-for-byte diffing against the prior function body only, not by execution**. This is the single most important "unverified area" carried into the final report.
   - Not executed (declared honestly): the actual `submit_inspection` RPC was not run against any database, live or local.
   - Commit: (recorded after this batch's commit below).
5. Delivery inspection — **done**
   - Delivery inspection uses the same `InspectionFlow.tsx` component as pickup (branched on `type`), so most of the shared surface (assignment check, not-found state, offline capture, signatures) was already fully reviewed in Batch 4. This batch focused on what's specific to delivery: completion prerequisites, pickup-evidence visibility, repeated-completion handling.
   - Files reviewed: `src/pages/InspectionFlow.tsx` (delivery-specific branches, lines ~1520–1710: `hasPickupComplete`, `savedPickup` review display), `src/pages/JobDetail.tsx` (`derivePrimaryCta`), `supabase/migrations/20260713150000...sql` (re-read for the base to build on).
   - Verified findings (no fix needed): pickup-evidence visibility during delivery review is correctly implemented (`savedPickup` pulled from `job.inspections` and rendered in the delivery review step); repeated-completion is already rejected server-side (`INSPECTION_ALREADY_SUBMITTED` when `v_existing_inspected_at IS NOT NULL AND` job is in a blocking status).
   - Defects found: WORKFLOW-004 (P2, fixed both layers — see Defect Ledger).
   - Tests added: 3 new cases in `src/test/inspection-flow-guards.test.tsx` (8 total for the file).
   - Commands run: `tsc --noEmit` ✅, `eslint` (changed files) — 0 new errors (all flagged lines pre-existing), `vitest run` ✅ 51 files/401 tests, `vite build` ✅, `npm run release:validate:fast` ✅ overall WARNING (non-blocking), migration passes suites 02/04 cleanly.
   - Not executed (declared honestly): same as Batch 4 — the new migration's SQL was not run against any database, live or local.
   - Commit: (recorded after this batch's commit below).
6. Evidence capture and uploads — **done** (found a P1 regression of a previously-fixed, documented defect)
   - Files reviewed (full read): `src/hooks/useEvidenceCapture.ts`, `src/lib/featureFlags.ts`, `src/lib/pendingUploads.ts` (1400+ lines), `src/lib/evidence/evidenceStore.ts`, `src/lib/evidence/uploadQueue.ts`, `src/lib/evidence/types.ts`, `docs/security/EVIDENCE-PIPELINE-FIXES.md` (prior audit doc, for baseline of what was already meant to be fixed).
   - Execution path traced: capture → stage/save → queue (state machine: staged→ready/queued→uploading→uploaded, or →failed) → retry triggers (manual, focus, online, visibility, auto) → storage upload → DB insert.
   - Spot-checked prior fixes (V1/V6/V7/V9 from the historical doc) are still present and intact: 0-byte blob guard, damage-item ordinal ordering, photo↔damage_item link trigger. No regression found in those.
   - Defects found: WORKFLOW-005 (**P1**, fixed in both the legacy and v2 evidence pipelines — see Defect Ledger).
   - Feature-flag review: `EVIDENCE_V2_ENABLED` defaults OFF and fails closed (`cache[flag] ?? false`) even if the flags query errors — confirmed no incomplete-flow exposure risk from the flag mechanism itself.
   - Tests added: 4 new cases in `src/test/pending-uploads.test.ts` (17 total), 3 new cases in `src/test/evidence-store.test.ts` (14 total).
   - Commands run: `tsc --noEmit` ✅, `eslint` (changed files) — 0 new errors, `vitest run` ✅ 51 files/408 tests, `vite build` ✅.
   - Not executed (declared honestly): could not reproduce an actual browser/app crash mid-upload on a real device; the "stranded uploading" scenario was reproduced by direct IndexedDB state manipulation in tests (seeding `state: "uploading"` with an old timestamp), which exercises the exact same code path a real crash would leave behind, but is not the same as observing a real crash.
   - Commit: (recorded after this batch's commit below).
7. Offline queue and retry behaviour — **done** (extended WORKFLOW-005 to a third module — the highest-stakes one)
   - Files reviewed (full read): `src/lib/submitQueue.ts` (whole-inspection offline queue), `src/lib/retryOrchestrator.ts` (trigger/cooldown orchestration), `src/components/QueuedSubmissionsSection.tsx` (UI wiring).
   - Verified findings (no fix needed): `retryOrchestrator.ts`'s concurrency model (global lock, per-job lock, anti-storm cooldown, jitter against simultaneous online+visibility+focus firing) is correctly implemented with proper `finally`-guaranteed lock release. No defects found.
   - Defects found: WORKFLOW-005 extended — same root cause found a third time in `submitQueue.ts`, the highest-stakes instance (loses a whole inspection submission, not one photo). Fixed with the same pattern.
   - Tests added: `src/test/submit-queue-stranded.test.ts` (5 cases, new file — this module had zero prior test coverage).
   - Commands run: `tsc --noEmit` ✅, `eslint` (changed files) — 0 new errors, `vitest run` ✅ 52 files/413 tests, `vite build` ✅.
   - Not executed (declared honestly): same as Batch 6 — reproduced via direct IndexedDB state manipulation in tests, not an actual observed app crash.
   - Commit: (recorded after this batch's commit below).
8. POD generation and review — **done**
   - Execution path traced: `PodReport.tsx`/`AdminPodReview.tsx`/`ControlPodReview.tsx` → `completeJobRpc` (`src/lib/api.ts`) → `complete_job` RPC → `sharePodPdf`/`emailPodPdf` (`src/lib/podPdf.ts`) → `generatePodPdf` (client-side jsPDF render, no server round-trip) → optional Supabase Storage upload (`pod-pdfs`/`pod-photos` buckets, signed URLs) → optional `send-pod-email` edge function (Resend), with mailto/navigator.share fallbacks.
   - Files reviewed (full read): `src/lib/podReadiness.ts` (pure readiness-check function — well-designed, no defect), `src/lib/api.ts`'s `completeJobRpc`, `supabase/migrations/20260422120617_..._cdf34bef...sql` (original `complete_job` definition), `src/lib/podPdf.ts` (1227 lines — `generatePodPdf`, `sharePodPdf`, `emailPodPdf`, signature/photo image loading with retry, signed-URL re-resolution, zip building), `src/lib/podEmail.ts` (mailto fallback body generation), `src/features/control/pages/ControlPodReview.tsx`, `src/pages/AdminPodReview.tsx`, `src/pages/PodReport.tsx` (confirm-review handlers and their catch blocks).
   - Verified findings (no fix needed): `podPdf.ts` already handles every failure mode named in the audit brief for this batch gracefully — missing image/signature renders "Image unavailable"/"Not signed" placeholders rather than breaking the PDF; expired signed URLs are re-resolved via `resolveSignatureForPdf`/`resolveImageUrlAsync` before every fetch, with a retry pass for transient failures; PDF generation, zip upload, and email send are all best-effort with `try`/`catch` fallbacks (mailto/share) so a failure never blocks or silently fakes a success. All three "Confirm review" call sites surface RPC errors via a destructive toast with `e.message` — none swallow errors silently. `podEmail.ts` is pure string formatting with no defect.
   - Defects found: **WORKFLOW-006 (P1)** — `complete_job` RPC had no authorization check at all (any driver could call it directly and bypass admin POD review); see Defect Ledger for full detail and fix.
   - Tests added: `src/test/complete-job-rpc.test.ts` (4 cases: RPC call shape, `ADMIN_OR_SUPER_ADMIN_ONLY` translation, `INVALID_COMPLETION_TRANSITION` translation, unrecognised-error passthrough).
   - Commands run: `tsc --noEmit` ✅ (clean), `eslint src/lib/api.ts src/test/complete-job-rpc.test.ts` — 33 pre-existing `no-explicit-any` errors (none new; the new `ADMIN_OR_SUPER_ADMIN_ONLY` branch introduces no `any`), `vitest run` ✅ 53 files / 417 tests (up from 413 — 4 new), `npm run build` ✅, `npm run release:validate:fast` ✅ (WARNING only, non-blocking, pre-existing).
   - Not executed (declared honestly): the new `complete_job` migration is verified by static review and byte-for-byte diffing against the prior function body only, not by executing it against a live database (no staging environment in this session; see Section 5) — same caveat as WORKFLOW-003/004. Also not executed: an actual PDF render/visual inspection of `generatePodPdf`'s output, an actual `send-pod-email` invocation, and an actual admin-approval click-through in a running browser — all reviewed via full static code read only.
   - Commit: (recorded after this batch's commit below).
9. Admin dashboard and review workflows — **done**
   - Execution path traced: `AdminDashboard.tsx` (intervention KPIs, ranked Needs Action queue, operations buckets, management routes) → `AdminUsers.tsx`/`UserDetailEditor.tsx`/`PermissionEditor.tsx`/`CreateUserModal.tsx` → `userLifecycleApi.ts` → `user-lifecycle` edge function (list/get/create/update_profile/set_role/activate/suspend/reactivate/archive_driver/restore_driver/get_permissions/set_permission_override); `AdminOnboarding.tsx` → `onboardingApi.ts` → direct Supabase client calls against `driver_onboarding` table + `onboarding-docs` storage (RLS-enforced, no edge function); `AdminDrivers.tsx` (read-only workload/risk view).
   - Files reviewed (full read): `AdminDashboard.tsx` (754 lines), `AdminUsers.tsx`, `UserDetailEditor.tsx` (453 lines), `PermissionEditor.tsx`, `CreateUserModal.tsx`, `AdminOnboarding.tsx` (449 lines), `AdminDrivers.tsx`, `AdminFinance.tsx`, `supabase/functions/user-lifecycle/index.ts` (1052 lines — full authz gate, `set_role`, `set_permission_override`, `create` handlers read in detail), `supabase/migrations/20260317100818_..._driver_onboarding` (original RLS + storage policies).
   - Verified findings (no fix needed): `user-lifecycle`'s general request gate correctly derives role/org from `user_profiles` only (never JWT metadata — the established C3 pattern), rejects suspended callers, and requires admin/super-admin for every action. `set_role` correctly prevents self-modification, org-scope violations, protected-account changes, and escalation beyond the caller's own role level. `create` correctly blocks a non-super-admin from creating a `super_admin` user and from creating users outside their own org. `AdminDashboard.tsx`/`AdminDrivers.tsx`/`AdminFinance.tsx` are well-structured read/dispatch surfaces with no defects found.
   - Defects found: **SECURITY-001 (P1)** — `driver_onboarding` table RLS let any org member (not just admins) write onboarding review decisions (self-approval risk), and the `onboarding-docs` storage bucket had no org scoping at all (cross-tenant document exposure). **SECURITY-002 (P1)** — `user-lifecycle`'s permission-override escalation guard was ANDed with a hardcoded 3-key allowlist instead of gating on `is_sensitive` alone, letting a plain admin manage any other sensitive permission via direct API call. See Defect Ledger for full detail and fixes.
   - Tests added: 2 new cases in `src/test/release-validation-suite-05.test.ts` (7 total) for SECURITY-001's suite-05 regression check; `src/test/permission-escalation.test.ts` (2 cases, new file) for SECURITY-002.
   - Commands run: `tsc --noEmit` ✅ (clean), `eslint` on all touched files (0 errors), `vitest run` ✅ 54 files / 421 tests (up from 417 at end of Batch 8 — 4 new), `npm run build` ✅, `npm run release:validate:fast` ✅ (WARNING only, non-blocking, pre-existing profile unchanged — now 8/8 checks pass in suite 05, up from 6).
   - Not executed (declared honestly): SECURITY-001's RLS/storage-policy fix is verified by static review and a suite-05 regression check only, not executed against a live database — same caveat as WORKFLOW-003/004/006. `Timesheets.tsx`, `DriverProfileDetail.tsx`/`DriverOnboardingWizard.tsx` (onboarding wizard writes to `driver_profiles`, a separate table from `driver_onboarding` — reviewed enough to confirm it's a distinct system, not read line-by-line), and `AdminPodReview.tsx`'s non-completion code paths were not reviewed at the same depth this batch; `AdminFinance.tsx`'s underlying expense data/CSV export logic is deferred to Batch 10 (Expenses, finance and invoicing) where it belongs.
   - Commit: (recorded after this batch's commit below).
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
