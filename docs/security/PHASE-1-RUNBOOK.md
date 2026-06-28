# Phase 1 Security Remediation — Deployment Runbook

> Production-grade, incremental rollout of the Critical findings (C1–C7) plus H1 and L1
> from the Axentra Vehicles audit. Apply **one stage at a time**, validate, then proceed.
> If any check fails, **stop and report** before continuing.

## Pre-flight (do this once, before Stage 1)

1. **Full database backup** (Supabase dashboard → Database → Backups → create a manual
   backup, or `supabase db dump --db-url "$PROD_DB_URL" -f pre-phase1.sql`). Confirm it
   completes and is downloadable.
2. **Export current state** for diffing later:
   - Schema + policies: `supabase db dump --schema public --schema storage -f schema-pre.sql`
   - Edge functions: already in `supabase/functions/` (this branch is the source of truth).
   - Storage config: note bucket `public` flags (Storage → each bucket → settings).
3. **Confirm the staging/preview project** (if available) and apply each stage there first.
4. Migrations live in `supabase/migrations/`; rollback scripts in `supabase/rollback/`.
   Apply with `supabase db push` (or the Lovable/Supabase pipeline). Rollbacks are applied
   manually via SQL editor / `psql` if a stage must be reverted.

---

## Stage 0 — `.env` hygiene (L1)  ✅ code-only, no DB change
- `.env` is now untracked; `.env.example` documents the public VITE_* vars.
- **Action for you:** ensure the real `.env` still exists locally / in your deploy secrets.
- **Anon-key rotation is deferred to the very end of Phase 1** (see Stage 7).

---

## Stage 1 — Backfill `user_profiles` + signup trigger (C4 prerequisite)
Migration: `20260628100000_phase1_backfill_user_profiles_and_signup_trigger.sql`
Rollback:  `supabase/rollback/20260628100000_*.down.sql`

This is **additive and non-breaking** — it does not yet change any RLS helper.

### Apply
`supabase db push` (this single migration).

### Verify (all must pass before Stage 2)
```sql
-- (a) Every auth user now has exactly one profile row:
SELECT
  (SELECT count(*) FROM auth.users)                  AS auth_users,
  (SELECT count(*) FROM public.user_profiles)        AS profiles,
  (SELECT count(*) FROM auth.users au
     WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles up
                       WHERE up.auth_user_id = au.id)) AS missing_profiles;
-- Expect: missing_profiles = 0

-- (b) AUDIT: users whose org_id was sourced ONLY from user_metadata
--     (i.e. app_metadata had no org). Eyeball these for tampering before Stage 2.
SELECT au.id, au.email,
       au.raw_app_meta_data  ->> 'org_id' AS app_org,
       au.raw_user_meta_data ->> 'org_id' AS user_org,
       up.org_id              AS backfilled_org,
       up.role
FROM auth.users au
JOIN public.user_profiles up ON up.auth_user_id = au.id
WHERE coalesce(au.raw_app_meta_data ->> 'org_id', '') = ''
  AND coalesce(au.raw_user_meta_data ->> 'org_id', '') <> '';
-- Investigate any row whose org/role looks wrong; correct via the admin UI.

-- (c) AUDIT: anyone who self-asserted a privileged role in user_metadata that
--     was (correctly) NOT honoured by the backfill:
SELECT au.id, au.email,
       au.raw_user_meta_data ->> 'role' AS claimed_role,
       up.role                          AS actual_role
FROM auth.users au
JOIN public.user_profiles up ON up.auth_user_id = au.id
WHERE lower(coalesce(au.raw_user_meta_data ->> 'role','')) IN ('admin','super_admin','superadmin')
  AND up.role = 'driver';
-- Expect: these remain 'driver'. Any such row = an attempted escalation; review.

-- (d) Trigger smoke test (staging): create a user, confirm a 'driver' profile appears.
```

### App validation
Sign in as a known admin and a known driver; confirm both see the correct UI (the client
reads role from `user_profiles`, so this exercises the backfill end-to-end).

### Rollback
Apply `supabase/rollback/20260628100000_*.down.sql` (drops trigger/function; leaves data).

---

## Stage 2 — Deny-by-default RLS helpers (C4)
Migration: `20260628100100_phase1_deny_by_default_rls_helpers.sql`
Rollback:  `supabase/rollback/20260628100100_*.down.sql`

Removes the JWT metadata fallback from `is_super_admin()`, `user_role()`,
`user_org_id()`. **Do not apply until Stage 1 verify (a) shows
`missing_profiles = 0`** and the Stage 1 audit queries (b)/(c) are clean.

### Apply
`supabase db push` (this single migration).

### Verify
```sql
-- Helpers now ignore JWT metadata. Confirm a known super-admin and admin still
-- resolve correctly (run while impersonating, or check via the app):
SELECT public.user_role(), public.user_org_id(), public.is_super_admin();

-- Confirm NO authenticated user can be super-admin without a profile row:
SELECT count(*) FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.auth_user_id = au.id);
-- Expect 0 (already guaranteed by Stage 1 + the signup trigger).
```

### App validation (critical — exercises every RLS-gated read/write)
Smoke test as **driver**, **org admin**, and **super-admin**:
job list/download, inspection submit, photo upload, signature capture, POD
generation, admin dashboards, Google Sheets sync, expenses. A driver must NOT
see other orgs' data. If anything 403s for a legit user, check their
`user_profiles` row first; only roll back if data is correct but access is wrong.

### Rollback
Apply `supabase/rollback/20260628100100_*.down.sql` (restores metadata fallback).

---

## Stage 3 — Edge-function authz from `user_profiles` (C3)
Code only (no migration). Files:
`supabase/functions/_shared/auth.ts` (new shared helper),
`assign-driver/`, `get-org-users/`, `gcs-upload/`, `user-lifecycle/`.

All caller authorization now derives role/org from `user_profiles` via the
service role; `user_metadata` is never trusted. `assign-driver` now **upserts
`user_profiles`** (previously it wrote only `user_metadata`, which after Stage 2
would have left assigned drivers with no org). `sync_profiles` no longer derives
role from `user_metadata`. Suspended callers are rejected.

> `promote-admin` is intentionally unchanged: its super-admin gate already reads
> only `app_metadata` (service-controlled, not self-writable).

### Deploy
`supabase functions deploy assign-driver get-org-users gcs-upload user-lifecycle`
(the `_shared` module is bundled automatically).

### Verify (negative + positive)
1. **Driver cannot escalate:** as a driver, run in the browser console
   `await supabase.auth.updateUser({ data: { role: 'admin', org_id: '<otherOrg>' } })`,
   refresh the token, then call `assign-driver` / `get-org-users` / `user-lifecycle`.
   All must return **403** (profile still says driver).
2. **Admin still works:** as a real org admin, list org users, assign a driver,
   set a role — all succeed and are scoped to the admin's org.
3. **Assigned driver gets access:** assign a driver to your org, then sign in as
   that driver and confirm they see the org's jobs (proves the user_profiles
   upsert works end-to-end with the Stage 2 helpers).
4. Cross-org: super-admin can target another org with `org_id`; an org admin
   cannot (403 CROSS_ORG_FORBIDDEN / ORG_SCOPE_VIOLATION).

### Rollback
`git revert` the Stage 3 commit and redeploy the four functions. (No DB change.)

---

## Stage 4 — Path→org authorization for storage IDOR (C1, C2)
Code only. Files: `_shared/auth.ts` (adds `callerCanAccessPath`),
`gcs-proxy/`, `resolve-signature-url/`.

Both functions now resolve the owning org of the requested object from the DB
(every object path is `jobs/<jobId>/...`, so org = `jobs.org_id`) and require it
to match the caller's org (super-admins bypass). Fails closed when a path has no
resolvable job/org.

> **Deviation from the audit's wording:** the `?token=` query param on `gcs-proxy`
> is **retained**, not removed — `<img>`/streamed responses cannot send an
> Authorization header, so removing it would break all image/POD rendering. It
> carries the caller's own JWT. Replacing it with a signed-cookie/signed-path
> scheme is deferred to Phase 2 (needs a coordinated client change). The actual
> IDOR is fully closed by the org check.

### Deploy
`supabase functions deploy gcs-proxy resolve-signature-url`

### Verify
1. **Cross-org read blocked:** as a driver in org A, call `gcs-proxy?path=jobs/<jobB>/...`
   and `resolve-signature-url` with `{ rawUrl: 'jobs/<jobB>/signatures/.../driver.png' }`.
   Both must return **403 FORBIDDEN**.
2. **Own-org read works:** open a POD / job gallery / signature for a job in the
   caller's own org — images and signatures render exactly as before.
3. **Regression watch (legacy data):** test several historical jobs (especially
   the oldest). Any object whose stored path does NOT start with `jobs/<uuid>/`
   would 403 for non-super-admins — if you find such legacy paths, report before
   proceeding so we can add a resolver for that shape.

### Rollback
`git revert` the Stage 4 commit and redeploy the two functions.

---

## Stage 5 — Storage + residual-RLS hardening (H1, C5 partial)
Migration: `20260628100200_phase1_storage_and_residual_rls_hardening.sql`
Rollback:  `supabase/rollback/20260628100200_*.down.sql`

Shipped (validated non-breaking):
- **H1** expense-receipts bucket is now org-scoped (was readable by any
  authenticated user). Existing stored signed URLs keep working (signed URLs
  bypass RLS); new uploads pass the org check because the uploader owns the
  expense.
- **C5** `sheet_sync_config` / `sheet_sync_logs` locked to admins (no client
  reads them; the service-role sync bypasses RLS).
- `app_settings` writes restricted to admins; reads stay open.

### Apply / Verify
`supabase db push`. Then:
```sql
-- expense receipt cross-org read denied for a normal user (run as that user):
-- SELECT ... from storage with a name '<otherOrgExpenseId>/x.jpg' must return nothing.
```
App: as an admin, open Expenses, upload a receipt, view it; confirm receipts of
other orgs are not visible. Confirm the Sheets sync (if used) still runs (service
role). Confirm feature flags still load.

### ⚠️ Deferred from Phase 1 — REQUIRES APPROVAL + CLIENT WORK (reported, not shipped)
- **C5 `qr_confirmations` (still `USING(true)`):** the anonymous customer
  handover page (`QrConfirm.tsx`) reads a confirmation **by token** and a job
  lookup as the anon role. Pure RLS cannot express "anon may read only the row
  whose token it supplies." Safe fix = two `SECURITY DEFINER` RPCs
  (`get_qr_confirmation(token)`, `confirm_qr(token, name, notes)`) + rework
  `qrApi.ts`/`QrConfirm.tsx` to call them, then deny direct anon table access.
  Needs testing of the live customer flow.
- **C6 `vehicle-photos` bucket (`public = true`):** still referenced as the
  non-GCS fallback bucket (`internalStorageService.ts`) and may hold legacy
  public-URL data. Flipping to private + org-scoped policies must be paired with
  confirming the active storage backend and migrating/erroring legacy public
  URLs. **Action:** confirm whether this bucket still receives or serves data; if
  legacy-only, plan a migration to GCS then privatise.

### Rollback
Apply `supabase/rollback/20260628100200_*.down.sql`.

---

## Stage 5b — Close the `vehicle-signatures` storage-API IDOR (NEW finding)
Migration: `20260628100300_phase1_close_signature_storage_idor.sql`
Rollback:  `supabase/rollback/20260628100300_*.down.sql`

Surfaced during the C5/C6 review: when `vehicle-signatures` was made private, the original
`"Allow public … vehicle-signatures" USING(true)` policies were never dropped. Because RLS
policies are OR'd, that permissive SELECT still let any authenticated (likely anon) user read
**any** org's signature directly via the storage API — bypassing the Stage 4 `resolve-signature-url`
check. **This migration drops those policies and replaces the write policies with org-scoped
insert/update/delete** (UPDATE is required because signature upload uses `upsert`). Display is
unaffected (service-role signed URLs bypass RLS).

### Apply / Verify / Pass-fail
See `PHASE-1-STAGING-VALIDATION.md` → "Stage 5b" (Gate G5b): no permissive signature policies
remain; cross-org signature read = 0; **signature capture, re-capture (upsert overwrite), and POD
display all still work**.

### Rollback
Apply `supabase/rollback/20260628100300_*.down.sql` (re-opens the hole — last resort only).

---

## Stage 6 — Regression test + CI
Code only. `supabase/functions/_shared/pathAuth.ts` (pure logic),
`src/test/storage-path-auth.test.ts`.

The IDOR org-resolution rule (`extractJobIdFromPath`) is extracted into a pure
module and unit-tested (fail-closed on non-`jobs/<uuid>/` paths, traversal,
empty, and id-smuggling). Locally validated: `typecheck` ✓, `vitest` 296/296 ✓,
`build` ✓.

> Note: full edge-function authz/IDOR and RLS behaviour can only be exercised
> against a real Supabase instance — run the per-stage "Verify" checks above on
> staging. Add them to CI as integration tests when a test project is available.

---

## Stage 7 — Rotate the anon key (LAST — only after all of the above is validated)
1. Supabase dashboard → Project Settings → API → roll the `anon` key.
2. Update the deploy secret / `.env` (`VITE_SUPABASE_PUBLISHABLE_KEY`) and
   redeploy the frontend.
3. Because the old `.env` was in git history, also consider purging history
   (e.g. `git filter-repo`) if the repo is or was ever shared.

---

## Post-implementation security audit (fill in after staging validation)

**Closed in Phase 1:** C1, C2 (storage IDOR), C3 (metadata privilege escalation),
C4 (RLS metadata fallback), C5 (sheet-sync/app_settings), H1 (expense receipts),
L1 (.env).

**Remaining / deferred risks to track:**
- **C5 (qr_confirmations)** and **C6 (vehicle-photos public bucket)** — deferred
  with documented designs (need client work + live validation).
- **Token-in-URL on gcs-proxy** — retained for `<img>` compatibility; harden to
  signed-path/cookie in Phase 2.
- **Residual target `user_metadata.role` writes** in `user-lifecycle`/`promote-admin`
  — now inert (nothing authorizes off them) but should be removed in Phase 4 to
  avoid future footguns.
- **`external` edge functions** (`vehicle-lookup`, `maps-directions`, `vision-ocr`,
  etc.) remain `verify_jwt = false` and unauthenticated — quota-abuse risk only,
  no data exposure; add auth/rate-limits in a later pass.
- Then proceed to **Phase 2** (data-integrity: C7 + H5/H6 + tests).
