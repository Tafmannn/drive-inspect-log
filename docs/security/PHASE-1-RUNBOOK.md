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
