# Phase 1 — Staging-First Validation Plan

Validate the Phase 1 security fixes against a **staging environment with production-like data**
before any production deployment. Apply one stage at a time, run its verification, meet its
pass criteria, then proceed. **If any check fails, STOP and report.** Nothing here rotates keys
or touches production. A helper script, `scripts/staging/apply-phase1-staging.sh`, runs the gated
sequence and is hard-blocked from ever targeting the production project.

```bash
export PROD_REF=lynkvfduzqdyvlzgriyh                     # production (blocked in the script)
export STAGING_REF=<staging-project-ref>
export STAGING_DB_URL="postgresql://postgres:<pwd>@db.<staging-ref>.supabase.co:5432/postgres"
export PROD_DB_URL="postgresql://postgres:<pwd>@db.lynkvfduzqdyvlzgriyh.supabase.co:5432/postgres"
```

---

## 1. Safest way to test on staging
A dedicated, isolated **staging Supabase project seeded from a production backup** — the only
option giving both production-like data (real org/user/job distribution, so RLS/tenancy is truly
exercised) and full isolation. Guards:
- Treat staging data as **production-confidential** (real PII); restrict access; delete when done.
- **Neutralise external side-effects** on the staging project's Edge Function secrets:
  - `GOOGLE_SERVICE_ACCOUNT_JSON` → a **test GCS bucket** (the functions hard-code bucket
    `axentra_db`; if you cannot point elsewhere, keep GCS tests read-only — do not delete objects).
  - email/SMTP and `sheet_sync_config.spreadsheet_id` → a **test sheet**, so a sync run during
    validation never mutates the production sheet.
- Deploy the **pre-Phase-1 baseline** functions (current `main`) first, so staging starts where
  prod is, then roll Phase 1 forward stage-by-stage.

Alternative (mechanics only, NOT production-like data): **Supabase Branching** — auto-applies
migrations with isolated keys but does not clone prod data; use it only as a smoke test.

---

## 2. Backup / export steps (before staging or prod)
On **production** (read-only):
```bash
# Restore point (dashboard: Database → Backups → "Backup now", or confirm PITR + note timestamp).
supabase db dump --db-url "$PROD_DB_URL" -f prod-schema-pre.sql            # schema + policies
supabase db dump --db-url "$PROD_DB_URL" --data-only -f prod-data-pre.sql  # data
supabase db dump --db-url "$PROD_DB_URL" --schema storage -f prod-storage-pre.sql
psql "$PROD_DB_URL" -c "select id, public from storage.buckets order by id;" | tee prod-buckets-pre.txt
psql "$PROD_DB_URL" -c "select proname, pg_get_functiondef(oid) from pg_proc \
  where proname in ('is_super_admin','user_role','user_org_id') order by proname;" | tee prod-helpers-pre.txt
supabase secrets list --project-ref "$PROD_REF" | tee prod-secrets-names.txt   # names only
```
Seed **staging**, then set staging secrets to TEST resources and deploy the baseline:
```bash
psql "$STAGING_DB_URL" -f prod-schema-pre.sql
psql "$STAGING_DB_URL" -f prod-data-pre.sql        # also restore --schema auth if your dump excludes it
git checkout main && supabase functions deploy --project-ref "$STAGING_REF" && git checkout claude/axentra-audit-kzgo4m
```
**Gate G0:** staging restored, secrets point to test resources, baseline deployed, prod artifacts saved.

> Apply migrations one file at a time for gated control:
> `psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/<file>.sql`
> (or run `scripts/staging/apply-phase1-staging.sh`). Do **not** use `supabase db push` for the
> gated run — it applies all pending migrations at once and skips the critical Stage 1→2 gate.

---

## 3–6. Per stage: commands · verification · expected · pass/fail

### Stage 1 — Backfill `user_profiles` + signup trigger (additive)
Apply `20260628100000_*.sql`. Verify:
```sql
SELECT (SELECT count(*) FROM auth.users) AS auth_users,
       (SELECT count(*) FROM public.user_profiles) AS profiles,
       (SELECT count(*) FROM auth.users au WHERE NOT EXISTS
          (SELECT 1 FROM public.user_profiles up WHERE up.auth_user_id=au.id)) AS missing_profiles;   -- Q1
SELECT role, count(*) FROM public.user_profiles GROUP BY role ORDER BY role;                          -- Q2
SELECT au.email, au.raw_user_meta_data->>'role' claimed, up.role actual                                -- Q3
FROM auth.users au JOIN public.user_profiles up ON up.auth_user_id=au.id
WHERE lower(coalesce(au.raw_user_meta_data->>'role','')) IN ('admin','super_admin','superadmin') AND up.role='driver';
-- Q4 org-from-user_metadata audit, Q5 trigger smoke test: see runbook.
```
**Expected:** Q1 `missing_profiles=0`, `profiles>=auth_users`; Q2 super_admin count matches your
known list, no surprise admins; Q3 **0 rows**; Q4 every row a legit legacy driver; Q5 new user is
`driver`/`pending_activation`. App: admin + driver logins render correctly.
**Gate G1:** PASS only if Q1=0, Q3=0, Q2/Q4 reviewed-clean, logins OK. Else roll back, report.

### Stage 2 — Deny-by-default RLS helpers (depends on G1)
Apply `20260628100100_*.sql`. Verify:
```sql
SELECT proname, (pg_get_functiondef(oid) ILIKE '%user_metadata%' OR pg_get_functiondef(oid) ILIKE '%app_metadata%')
  AS references_jwt_meta FROM pg_proc WHERE proname IN ('is_super_admin','user_role','user_org_id');   -- Q1

SELECT set_config('request.jwt.claims', json_build_object('sub','<admin-uid>')::text, true);            -- Q2 (positive)
SELECT public.user_role(), public.user_org_id(), public.is_super_admin();

SELECT set_config('request.jwt.claims',                                                                  -- Q3 (C4 negative)
  json_build_object('sub','<driver-uid>','user_metadata',json_build_object('role','super_admin'))::text,true);
SELECT public.is_super_admin() AS should_be_false, public.user_role() AS should_be_driver;

SET LOCAL ROLE authenticated;                                                                            -- Q4 (RLS tenancy)
SELECT set_config('request.jwt.claims', json_build_object('sub','<driver-A-uid>','role','authenticated')::text,true);
SELECT count(*) visible_jobs, count(*) FILTER (WHERE org_id<>'<org-A>') cross_org_jobs FROM public.jobs;
RESET ROLE;
```
**Expected:** Q1 all `false`; Q2 the admin's true role/org; Q3 `should_be_false=false`,
`should_be_driver='driver'`; Q4 `cross_org_jobs=0`. App: full driver/admin/super-admin smoke test;
a driver sees only their org.
**Gate G2:** PASS only if Q1 all-false, Q3 proves no forged escalation, Q4=0 cross-org, all roles
complete core flows. If a legit user is wrongly 403'd, fix their `user_profiles` row first; only
roll back if data is correct but access is wrong.

### Stage 3 — Edge-function authz (deploy `assign-driver get-org-users gcs-upload user-lifecycle`)
Verify (against STAGING keys): (1) as a driver, `supabase.auth.updateUser({data:{role:'admin',org_id:'<other>'}})`,
re-auth, then call each function; (2) as a real admin, list/assign/set-role; (3) assign a driver then
sign in as them; (4) admin targets another org's `org_id`.
**Expected:** (1) **403** on all three; (2) succeed, org-scoped; (3) the driver now sees org jobs;
(4) **403** for admin, allowed for super-admin.
**Gate G3:** PASS only if the escalation attempt is 403 on all three and admin/assignment flows work.
Any 200 on (1) = FAIL → `git revert` Stage 3 commit, redeploy, report.

### Stage 4 — Storage IDOR functions (deploy `gcs-proxy resolve-signature-url`)
Verify: (1) as a driver in org A, `GET gcs-proxy?path=jobs/<jobB>/...&token=<driverA_jwt>` and
`POST resolve-signature-url {"rawUrl":"jobs/<jobB>/signatures/.../driver.png"}`; (2) open own-org POD/
gallery/signature; (3) repeat (2) for several of the oldest jobs.
**Expected:** (1) **403 FORBIDDEN** both; (2) renders as before; (3) legacy own-org objects still render.
**Gate G4:** PASS only if cross-org=403 and all sampled own-org + legacy objects load. A legacy
own-org 403 = potential regression → report before prod.

### Stage 5 — Storage + residual RLS hardening (apply `20260628100200_*.sql`)
Verify:
```sql
SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
  AND policyname LIKE 'expense_receipts%';                                                  -- Q1 expect 3
SET LOCAL ROLE authenticated;                                                               -- Q2 receipts cross-org
SELECT set_config('request.jwt.claims', json_build_object('sub','<driver-A-uid>','role','authenticated')::text,true);
SELECT count(*) other_org_receipts FROM storage.objects o WHERE o.bucket_id='expense-receipts'
  AND split_part(o.name,'/',1) IN (SELECT id::text FROM public.expenses WHERE org_id<>'<org-A>');
SELECT count(*) sync_visible FROM public.sheet_sync_config;     -- expect 0
SELECT count(*) settings_visible FROM public.app_settings;      -- expect >0
RESET ROLE;
```
**Expected:** Q1=3 policies; `other_org_receipts=0`; `sync_visible=0`; `settings_visible>0`.
App: admin uploads + views a receipt; other orgs' receipts hidden; feature flags load; (test) sync works.
**Gate G5:** PASS only if all of the above hold.

### Stage 5b — Close vehicle-signatures storage-API IDOR (apply `20260628100300_*.sql`)
Closes the leftover-permissive-policy hole that let any authenticated user read any org's signature
directly via the storage API (bypassing Stage 4). Verify:
```sql
SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects'      -- Q1
  AND policyname ILIKE '%signature%' ORDER BY policyname;
-- Expect: NO "Allow public ... vehicle-signatures" rows remain; present =
--   "Authenticated users can read org signatures" (SELECT) +
--   vehicle_signatures_insert_org / _update_org / _delete_org.

SET LOCAL ROLE authenticated;                                                                    -- Q2 cross-org read
SELECT set_config('request.jwt.claims', json_build_object('sub','<driver-A-uid>','role','authenticated')::text,true);
SELECT count(*) other_org_sigs FROM storage.objects o
WHERE o.bucket_id='vehicle-signatures'
  AND split_part(o.name,'/',2) IN (SELECT id::text FROM public.jobs WHERE org_id<>'<org-A>');
RESET ROLE;
```
**Expected:** Q1 no permissive `Allow public … vehicle-signatures` policies remain; the org-scoped
read + the three org write policies exist. Q2 `other_org_sigs=0`.
**App (critical):** as a driver, (a) **capture** a signature on an own-org job; (b) **re-capture**
(overwrite) the same signature — must succeed (proves the org-scoped UPDATE policy supports upsert);
(c) view the signature in the POD — renders via the service-role signed URL as before;
(d) confirm a signature for **another** org's job is not viewable.
**Gate G5b:** PASS only if Q1/Q2 hold AND capture, re-capture, and display all work. If re-capture
fails, the org-scoped UPDATE predicate is the suspect → report (do not ship 5b to prod yet).

### Stage 6 — Local regression suite (re-run on the branch)
```bash
npm run typecheck && npx vitest run && npm run build
```
**Expected:** typecheck exit 0; **296/296** tests pass; build OK (pre-existing chunk-size warning only).

---

## 7. Production Go / No-Go checklist
**GO only if ALL true:**
- [ ] G0–G5b all PASSED on staging with production-like data; query outputs captured as evidence.
- [ ] Stage 1 `missing_profiles=0`, escalation-laundering audit = 0 rows.
- [ ] Stage 2 helpers reference no JWT metadata; forged-`user_metadata` super-admin = false; cross-org jobs = 0.
- [ ] Stage 3 driver self-escalation = 403 on all three functions; admin/assignment flows OK.
- [ ] Stage 4 cross-org object read = 403; **all sampled legacy own-org objects still render**.
- [ ] Stage 5 receipts cross-org = 0; sheet-sync/app_settings behave; admin receipt flow OK.
- [ ] Stage 5b no permissive signature policies remain; cross-org sig read = 0; capture + re-capture + display OK.
- [ ] Local CI green (`typecheck` + `vitest 296/296` + `build`).
- [ ] Fresh **production** backup/restore-point taken immediately before the prod run.
- [ ] Low-traffic window scheduled; rollback owner on call; runbook open.
- [ ] Deferred items acknowledged out-of-scope for THIS deploy: **C5 qr_confirmations**, **full C6
      vehicle-photos privatisation**, token-in-URL hardening (see Deferred-Risk Analysis below).

**Production apply order (gated, same as staging):**
1. `psql "$PROD_DB_URL" -f .../20260628100000_*.sql` → Stage 1 verify
2. `psql "$PROD_DB_URL" -f .../20260628100100_*.sql` → Stage 2 verify
3. `supabase functions deploy assign-driver get-org-users gcs-upload user-lifecycle --project-ref "$PROD_REF"` → Stage 3
4. `supabase functions deploy gcs-proxy resolve-signature-url --project-ref "$PROD_REF"` → Stage 4
5. `psql "$PROD_DB_URL" -f .../20260628100200_*.sql` → Stage 5
6. `psql "$PROD_DB_URL" -f .../20260628100300_*.sql` → Stage 5b
7. Frontend deploy (carries the test only)
8. **Stage 7 — rotate the anon key** (dashboard → API), update the deploy secret, redeploy frontend;
   optionally purge `.env` from git history. **Last**, only after 1–7 validate.
   > Then reconcile CLI migration history (`supabase migration list --project-ref "$PROD_REF"`).

**NO-GO / STOP triggers:** any non-zero `missing_profiles`; any 200 on an escalation/cross-org test;
any legit role wrongly 403'd with correct profile data; any legacy own-org object that no longer
renders; signature re-capture failing; or any verification query returning an unexpected result.

**Rollback order (reverse of whatever was applied):**
- 5b → `psql "$PROD_DB_URL" -f supabase/rollback/20260628100300_*.down.sql`
- 5  → `psql "$PROD_DB_URL" -f supabase/rollback/20260628100200_*.down.sql`
- 4  → `git revert ca19693` + redeploy `gcs-proxy resolve-signature-url`
- 3  → `git revert d4df743` + redeploy the four functions
- 2  → `psql "$PROD_DB_URL" -f supabase/rollback/20260628100100_*.down.sql` (keep Stage 1)
- 1  → `psql "$PROD_DB_URL" -f supabase/rollback/20260628100000_*.down.sql` (leaves backfilled rows)
- Never run Stage 2 without Stage 1 in place.

---

## Deferred-Risk Analysis (C5 / C6) and recommendation

**C5 `qr_confirmations` (`USING(true)`, applies to PUBLIC):** today, anyone with the public anon
key can read every confirmation across all orgs — **customer names, notes, the secret handover
tokens**, `job_id`, event type, timestamps — and can INSERT/UPDATE/DELETE (forge/erase handovers).
No photos/signatures leak via this table, and `job_id` can't be pivoted (jobs are org-scoped, anon
has no org). High severity (PII + integrity). **Fix (Phase 1.5):** `SECURITY DEFINER` RPCs
`get_qr_confirmation(token)` / `confirm_qr(token,name,notes)` + rework `QrConfirm.tsx`/`qrApi.ts`,
then deny direct anon table access. Needs live customer-flow testing.

**C6 `vehicle-photos` (public bucket, leftover `USING(true)` policies):** **live, not legacy** —
`internalStorageService` writes photos here with **public URLs**, and `storage.ts` falls back to it
on any GCS failure; the `CLOUD_STORAGE_ENABLED` flag **defaults to false**. Anyone with the anon key
can list/download/upload/delete objects. Damage/POD/job photos *are* served from here whenever the
internal backend or fallback is used. **Fix (Phase 1.5):** confirm prod `CLOUD_STORAGE_ENABLED` and
whether `photos.url` holds `…/object/public/vehicle-photos/…` links, migrate those to GCS/proxy, then
set the bucket private + org-scope its policies.

**Go/No-Go on the deferred items:** Phase 1 (incl. Stage 5b) **does not depend on C5/C6** and is a
net security improvement; **neither blocks Phase 1**. Because the qr + vehicle-photos exposures are
**already live today**, schedule **Phase 1.5 immediately after** (ideally the same change window).
