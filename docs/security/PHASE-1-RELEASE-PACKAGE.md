# Phase 1 Security Release Package — Axentra Vehicles

Status: **implementation frozen**, awaiting staging validation + sign-off. Nothing in this
release has been deployed; no keys rotated; no live migrations applied. All artifacts live on
branch `claude/axentra-audit-kzgo4m`.

Contents:
1. Executive summary of fixes
2. Release notes (GitHub-ready)
3. Deployment checklist (step-by-step, no prior project knowledge assumed)
4. Validation checklist (every Axentra workflow)
5. Production rollback checklist
6. Post-deployment monitoring / logging / alerts
7. Remaining technical debt + Phase 2 priorities

Related docs: `PHASE-1-RUNBOOK.md` (per-stage detail) and `PHASE-1-STAGING-VALIDATION.md` (gated
staging queries + go/no-go).

---

## 1. Executive summary of every security issue fixed

Phase 1 closed a chain of multi-tenancy / privilege / storage vulnerabilities, each exploitable by
an ordinary logged-in driver with a **legitimate** token (no forgery required).

| ID | Severity | Issue | Fix | Migration / file |
|----|----------|-------|-----|------------------|
| **C4** | Critical | RLS helpers (`is_super_admin`, `user_role`, `user_org_id`) fell back to **self-writable JWT `user_metadata`** when a `user_profiles` row was missing → a profile-less user could set `user_metadata.role=super_admin` and have RLS honour it (full-DB compromise). | Backfill `user_profiles` for all users + signup trigger; rewrite helpers to read role/org **only** from `user_profiles` (deny-by-default). | `20260628100000`, `20260628100100` |
| **C3** | Critical | Edge functions authorized off self-writable `user_metadata.role/org_id` → a driver could `auth.updateUser({data:{role:'admin'}})` and self-promote. Initially fixed: `assign-driver`, `get-org-users`, `user-lifecycle`, `gcs-upload`. **A reviewer pass then found two more:** `gcs-fix-acl` (self-escalate → set `allUsers:READER` on all media) and `vision-ocr` (org from `user_metadata`). | All eight derive role/org from `user_profiles` via `_shared/auth.ts`; `assign-driver` upserts `user_profiles`; `gcs-fix-acl` is super-admin-only **and its "make media public" capability is removed**; `vision-ocr` org from profile. | edge functions |
| **C1** | Critical | `resolve-signature-url` authenticated but signed **any** path with the service role → any user could read any org's customer signatures. | Resolve the owning org from the path's `jobs/<jobId>/…` and require caller-org match. | `resolve-signature-url`, `_shared/pathAuth.ts` |
| **C2** | Critical | `gcs-proxy` only checked the caller *had* an org, never that the requested object belonged to it → cross-org read of all photos/PODs in the shared bucket. | Same path→org authorization before streaming. | `gcs-proxy` |
| **Stage 5b** | Critical | **(New finding)** Leftover `"Allow public … vehicle-signatures" USING(true)` policies were never dropped when the bucket went private → any authenticated (likely anon) user could read any org's signature **directly via the storage API**, bypassing the C1 fix. | Drop the permissive policies; org-scope signature insert/update/delete; keep org-scoped read. | `20260628100300` |
| **H1** | High | `expense-receipts` bucket readable by **any** authenticated user across orgs (`bucket_id`-only policy). | Org-scope receipt read/insert/delete via the `expenses` table. | `20260628100200` |
| **C5 (subset)** | High/Med | `sheet_sync_config` / `sheet_sync_logs` (`USING(true)`) world-accessible; `app_settings` world-writable. | Admin-only sync tables; admin-only `app_settings` writes (reads stay open). | `20260628100200` |
| **L1** | Low | `.env` committed to git (leaked project id, anon key, superadmin email list). | Untracked `.env`; added `.env.example`; removed dead `VITE_SUPERADMIN_EMAILS`. | repo |

**Deliberately deferred to Phase 1.5** (documented, not shipped — see §7): C5 `qr_confirmations`
(anonymous customer-flow rework), full C6 `vehicle-photos` privatisation, and `gcs-proxy`
token-in-URL hardening.

**Validation performed so far:** local only — `typecheck` ✓, `vitest` 296/296 ✓ (incl. a new
storage-IDOR unit test), `build` ✓. Live behaviour (RLS, edge authz, workflows) is validated on
staging per §3–4 before production.

---

## 2. Release notes (GitHub-ready)

> Copy the block below into the GitHub release / PR description.

### Phase 1 — Security Hardening (multi-tenancy, authorization, storage)

This release closes a set of critical multi-tenancy and authorization vulnerabilities. All were
exploitable by a normal authenticated user; there is no evidence requirement of forged tokens.

**Highlights**
- **Authorization is now sourced solely from the `user_profiles` table.** The database RLS helpers
  and the privileged Edge Functions no longer trust the user-writable JWT `user_metadata`, closing
  a privilege-escalation path (driver → admin/super-admin) and a cross-tenant data path.
  > **C3 closure note:** C3 is only fully closed **with `gcs-fix-acl` and `vision-ocr` remediated**.
  > A reviewer pass found those two still trusted `user_metadata`; this release fixes both
  > (`gcs-fix-acl` is super-admin-only and its "make all media public" capability was removed;
  > `vision-ocr` resolves org from `user_profiles`). Prior to that fix, C3 was only **partially** closed.
- **Storage access is org-scoped.** `gcs-proxy` and `resolve-signature-url` now verify that the
  requested object belongs to the caller's organisation, closing cross-org read of photos, PODs,
  and signatures. Leftover permissive `vehicle-signatures` policies were removed.
- **Expense receipts** are now organisation-scoped; **Google-Sheets-sync** config/logs and
  **app settings** writes are restricted to admins.
- **Secret hygiene:** `.env` is no longer tracked; an `.env.example` is provided.

**Database migrations (apply in order):**
`20260628100000` (backfill `user_profiles` + signup trigger) → `20260628100100` (deny-by-default
RLS helpers) → `20260628100200` (storage/RLS hardening) → `20260628100300` (signature policy fix).
Each has a rollback script in `supabase/rollback/`.

**Edge Functions redeployed:** `assign-driver`, `get-org-users`, `gcs-upload`, `user-lifecycle`,
`gcs-proxy`, `resolve-signature-url`, `gcs-fix-acl`, `vision-ocr` (`promote-admin` unchanged — its
gate already uses only service-controlled `app_metadata`). New shared module
`supabase/functions/_shared/`.

**Operational notes**
- Apply migrations **one at a time** and validate between stages (see `PHASE-1-RUNBOOK.md`).
- **Rotate the Supabase anon key** as the final step.
- Known follow-ups tracked for Phase 1.5: `qr_confirmations` anonymous-access rework and
  `vehicle-photos` bucket privatisation.

**Tests:** typecheck ✓ · unit suite 296/296 ✓ · build ✓.

---

## 3. Deployment checklist (step-by-step — assumes no prior project knowledge)

> Goal: deploy Phase 1 to **production** *after* staging has fully passed (`PHASE-1-STAGING-VALIDATION.md`).
> Do each step in order; do not continue past a failed check.

### 3.0 Prerequisites (one-time)
- [ ] Install the Supabase CLI (`supabase --version` works) and `psql` (PostgreSQL client).
- [ ] `supabase login` with an account that has access to the production project.
- [ ] Obtain and export the production values (from the Supabase dashboard → Project Settings):
  ```bash
  export PROD_REF=lynkvfduzqdyvlzgriyh
  export PROD_DB_URL="postgresql://postgres:<db-password>@db.lynkvfduzqdyvlzgriyh.supabase.co:5432/postgres"
  ```
- [ ] Check out the release branch: `git checkout claude/axentra-audit-kzgo4m && git pull`.
- [ ] Confirm staging sign-off: every gate G0–G5b in `PHASE-1-STAGING-VALIDATION.md` is marked PASS.

### 3.1 Backup (must complete before any change)
- [ ] Dashboard → Database → Backups → **Backup now** (or confirm PITR is on; record the timestamp).
- [ ] `supabase db dump --db-url "$PROD_DB_URL" -f prod-pre-phase1.sql` and keep the file safe.
- [ ] Record current bucket visibility:
      `psql "$PROD_DB_URL" -c "select id, public from storage.buckets order by id;"`.

### 3.2 Apply migrations + deploy functions (gated)
Run each, then run that stage's verification from `PHASE-1-STAGING-VALIDATION.md` §3–6 against
**prod** and confirm PASS before the next step.
- [ ] **Stage 1:** `psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260628100000_*.sql` → verify `missing_profiles = 0`, escalation-audit = 0 rows.
- [ ] **Stage 2:** `psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260628100100_*.sql` → helpers reference no JWT metadata; forged-super-admin test = false; cross-org jobs = 0.
- [ ] **Stage 3:** `supabase functions deploy assign-driver get-org-users gcs-upload user-lifecycle --project-ref "$PROD_REF"` → driver self-escalation = 403; admin flows OK.
- [ ] **Stage 4:** `supabase functions deploy gcs-proxy resolve-signature-url --project-ref "$PROD_REF"` → cross-org object read = 403; own-org + legacy objects render.
- [ ] **Stage 5:** `psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260628100200_*.sql` → receipts cross-org = 0; sync/app_settings OK.
- [ ] **Stage 5b:** `psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260628100300_*.sql` → no permissive signature policies remain; signature capture + **re-capture** + display all work.

### 3.3 Frontend
- [ ] Deploy the frontend from this branch through your normal pipeline (it carries only the new test).

### 3.4 Final — rotate the anon key (last)
- [ ] Dashboard → Project Settings → API → roll the **anon** key.
- [ ] Update `VITE_SUPABASE_PUBLISHABLE_KEY` in the deploy secret / `.env`; redeploy frontend.
- [ ] (Optional) purge `.env` from git history if the repo is/was shared.
- [ ] Reconcile migration history: `supabase migration list --project-ref "$PROD_REF"`.

### 3.5 Close-out
- [ ] Run the full §4 validation checklist on production.
- [ ] Enable the §6 monitoring/alerts.
- [ ] Record completion + any anomalies; keep the backup for at least 7 days.

---

## 4. Validation checklist (every Axentra workflow)

Run as three test users — **Driver**, **Org Admin**, **Super Admin** — plus the negative
(cross-org) tests. ✅ = expected pass.

### Authentication & roles
- [ ] Driver logs in → sees driver UI only. ✅
- [ ] Org Admin logs in → sees admin UI scoped to their org. ✅
- [ ] Super Admin logs in → sees all orgs. ✅
- [ ] **Escalation negative:** as a driver run `await supabase.auth.updateUser({ data:{ role:'super_admin', org_id:'<other>' }})`, re-auth → UI is still driver; admin pages refuse. ✅ (403/redirect)
- [ ] Suspended user cannot perform admin actions. ✅

### Driver workflow
- [ ] Open assigned job, start inspection, complete steps, submit. ✅
- [ ] Job list shows **only** the driver's org's jobs. ✅
- [ ] Download / view a POD for an own-org job. ✅

### Admin workflow
- [ ] View dashboards/KPIs for own org. ✅
- [ ] Create/edit a job; edit pricing. ✅
- [ ] **Cross-org negative:** admin cannot view or act on another org's jobs/users. ✅

### Super Admin workflow
- [ ] List/select any organisation; view cross-org data. ✅
- [ ] Create an organisation; promote/assign across orgs. ✅

### User creation / assignment / roles
- [ ] Admin invites/creates a user in their org (`user-lifecycle create`). ✅
- [ ] Assign a driver to the org (`assign-driver`) → sign in as that driver → they see org jobs. ✅ (proves `user_profiles` upsert)
- [ ] Set a role (`user-lifecycle set_role`); admin cannot grant super_admin. ✅
- [ ] **Cross-org negative:** admin assigning a user already in another org → 403. ✅

### Photo uploads
- [ ] Capture inspection/damage photos online → upload succeeds. ✅
- [ ] Offline capture → reconnect → queued photos upload. ✅
- [ ] Own-org photos render in job/POD views (via `gcs-proxy`). ✅
- [ ] **Cross-org negative:** `gcs-proxy?path=jobs/<otherOrgJob>/...` → 403. ✅

### Signatures
- [ ] Capture driver + customer signatures. ✅
- [ ] **Re-capture** (overwrite) a signature → succeeds (org-scoped UPDATE policy). ✅
- [ ] Signature renders in the POD. ✅
- [ ] **Cross-org negative:** `resolve-signature-url` for another org's signature → 403; direct storage-API read of another org's signature → denied. ✅

### POD generation
- [ ] Generate a POD with photos + signatures + damage table → renders/downloads. ✅
- [ ] POD images/signatures resolve (no broken images). ✅

### QR handover flow
- [ ] Driver generates a QR for collection/delivery. ✅
- [ ] Customer opens the link, confirms handover → status updates. ✅
  - ⚠️ Note: `qr_confirmations` is **unchanged** in Phase 1 (deferred to 1.5). Confirm the flow
    still works as before; the known exposure is tracked in §7.

### Expenses & receipts
- [ ] Add an expense; upload a receipt; view it. ✅
- [ ] **Cross-org negative:** another org's receipts are not listable/viewable. ✅
- [ ] Receipt appears on the relevant invoice/POD export. ✅

### Google Sheets sync
- [ ] Sync runs (push/pull) successfully (service role; against the **test** sheet in staging). ✅
- [ ] A non-admin cannot read `sheet_sync_config` / `sheet_sync_logs`. ✅
- [ ] Feature flags still load (`app_settings` readable). ✅

### Storage access (consolidated negative matrix)
- [ ] Driver A cannot read Org B photos, PODs, signatures, or receipts by any route (proxy, signed-url, or storage API). ✅
- [ ] Anon (no session) cannot read org-scoped objects. ✅

---

## 5. Production rollback checklist

Roll back in **reverse** order of what was applied. Decide per-stage: if a *legitimate* user is
blocked but their `user_profiles` data is wrong, **fix the data first** — only roll back if the code
is wrong.

- [ ] **Stage 5b:** `psql "$PROD_DB_URL" -f supabase/rollback/20260628100300_*.down.sql` (re-opens signature hole — last resort).
- [ ] **Stage 5:** `psql "$PROD_DB_URL" -f supabase/rollback/20260628100200_*.down.sql`.
- [ ] **Stage 4:** `git revert ca19693` → `supabase functions deploy gcs-proxy resolve-signature-url --project-ref "$PROD_REF"`.
- [ ] **Stage 3:** `git revert d4df743` → `supabase functions deploy assign-driver get-org-users gcs-upload user-lifecycle --project-ref "$PROD_REF"`.
- [ ] **Stage 2:** `psql "$PROD_DB_URL" -f supabase/rollback/20260628100100_*.down.sql` (restores metadata fallback). **Keep Stage 1.**
- [ ] **Stage 1:** `psql "$PROD_DB_URL" -f supabase/rollback/20260628100000_*.down.sql` (drops trigger/function; **leaves backfilled rows** — safe to keep).
- [ ] **Anon key:** if rotated and the frontend breaks, restore the prior key in the deploy secret and redeploy.
- [ ] **Last resort:** restore the §3.1 backup (full DB restore) — accept data written since the backup is lost.

**Hard rule:** never leave Stage 2 applied without Stage 1 (users would lose access). If reverting
Stage 2, you may keep Stages 0/1.

---

## 6. Post-deployment monitoring / logging / alerts

### Watch immediately after each stage (first 24–48h)
- **Auth/login success rate** — a drop after Stage 2 suggests a `user_profiles` data gap (some user
  has no/incorrect profile row). *Alert:* login failure rate > baseline.
- **Edge Function 403 rate** (`assign-driver`, `get-org-users`, `user-lifecycle`, `gcs-proxy`,
  `resolve-signature-url`) — a spike of 403s from *real* users = over-blocking (regression);
  a spike from one principal = blocked attack. *Alert:* per-function 403 rate ≫ baseline.
- **`gcs_fallback_to_internal` events** — already emitted via `logClientEvent` in `storage.ts:38`.
  A rise means GCS uploads are failing and photos are landing in the public `vehicle-photos`
  bucket (relevant to deferred C6). *Alert:* any sustained increase.
- **Signature capture/upload failures** — confirms the Stage 5b org-scoped write policies aren't
  rejecting legitimate (re-)captures. *Alert:* signature upload error rate > 0 baseline.
- **Image/POD render errors (404/403 from `gcs-proxy`)** — confirms own-org/legacy objects still
  resolve. *Alert:* `GCS_FETCH_FAILED` / 403 from the proxy.

### Standing observability to add (Supabase + app)
- **Supabase Postgres logs:** watch for RLS `permission denied` bursts (legit-user over-blocking).
- **Supabase Auth logs:** sign-in failures, suspicious `updateUser` metadata changes.
- **`admin_audit_log` / `permission_audit_log`:** review `set_role`, `create_user`, `create_org`,
  `assign-driver`, permission overrides — alert on any `super_admin` grant or out-of-window admin action.
- **Edge Function logs/metrics:** error rate, p95 latency, invocation volume per function.
- **Data-integrity probe (scheduled query):** `count(*) from auth.users` without a `user_profiles`
  row — should stay **0** (the signup trigger guarantees it). *Alert:* > 0.
- **Storage probe:** ensure no new objects are written to public `vehicle-photos` if GCS is the
  intended backend (ties to C6).

### Gap to close in Phase 2
There is currently **no application error monitoring** (no Sentry/observability) and logging is
console + a `logClientEvent` table only. Stand up Sentry (or equivalent) with PII-safe scrubbing as
an early Phase 2 item so the alerts above are actionable in real time.

---

## 7. Remaining technical debt + Phase 2 priorities

### Phase 1.5 — finish the security story (do first, fast follow)
- **C5 `qr_confirmations`** — `USING(true)` exposes customer names/notes/tokens anonymously and
  allows forging/deleting confirmations. Fix: `SECURITY DEFINER` RPCs `get_qr_confirmation(token)` /
  `confirm_qr(token,name,notes)` + rework `QrConfirm.tsx`/`qrApi.ts`; deny direct anon table access.
- **C6 `vehicle-photos`** — public bucket + leftover `USING(true)` policies; live fallback writes
  public photo URLs. Fix: confirm prod `CLOUD_STORAGE_ENABLED`; migrate any
  `…/object/public/vehicle-photos/…` URLs to GCS/proxy; set bucket private + org-scope policies.
- **`gcs-proxy` token-in-URL** — retained for `<img>` compatibility; harden to signed-path/cookie.
- **Inert `user_metadata.role` writes** in `user-lifecycle`/`promote-admin` — now unused; remove to
  prevent future footguns.
- **External Edge Functions** (`vehicle-lookup`, `maps-directions`, `postcode-lookup`,
  `business-search`, `place-details`) remain `verify_jwt = false` and unauthenticated — quota-abuse
  risk only; add auth/rate-limits. (`vision-ocr` and `gcs-fix-acl` are now `user_profiles`-authorized.)

### Phase 2 — data integrity & correctness (from the audit roadmap)
- **C7** inspection-submit vs. photo-promotion race → transactional/compensating reconciliation +
  server-side expected-photo-count check (risk of inspections marked complete without evidence).
- **H5** upload retry backoff + circuit breaker + input-size clamp.
- **H6** `org_id` backfill/`SET NOT NULL` insert race + explicit FK `ON DELETE` semantics (M7).
- **M2** object-URL revocation + `AbortController` cleanup (memory leaks).
- **M6** `completed_at` enforced via CHECK/full trigger.
- Integration tests for authz, offline+token-refresh, suspended accounts.

### Phase 3 — performance, scale, observability
- **H3** move PDF generation to a Web Worker (currently blocks the main thread).
- **M3** list virtualization; **M4** batched query invalidation; **H4** code-split admin bundles.
- **M1** durable/shared rate limiting; stand up **Sentry/observability** + PII-safe logging (M5).

### Phase 4 — maintainability & hardening
- **H2** enable TypeScript `strict`, remove `as any`/non-null assertions, make `npm run ci` a gate.
- Decompose 2000-line components; per-flow error boundaries; centralize role logic; single lockfile.
- Accessibility & mobile-UX pass; `SECURITY.md` + on-call runbook; load test toward 100k users.

### Snapshot scores (re-baseline after Phase 1 ships + validates)
Pre-Phase-1: Security **2/10**, Production readiness **3/10**. Phase 1 primarily lifts the security
posture (the critical IDOR/escalation chain) and partially production readiness; scalability,
maintainability, and data-integrity scores are unchanged until Phases 2–4.
