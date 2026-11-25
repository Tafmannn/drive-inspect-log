# Axentra staging recovery and production parity — 25 Nov 2026

Branch `claude/axentra-staging-recovery-r97icv`. The executed apply set is pinned at commit
`2281b284745d88a7f813524a2418384670e40681`. Staging project `mfedxybzajdgavzmajkl`. Production
project `lynkvfduzqdyvlzgriyh` was read only: catalogue queries, the ledger, 2 reference tables and advisors.

## Decision (updated 25 Nov, 20:10 UTC): **GO** for development and integration testing on staging · **NO-GO** for release sign-off until Gate 7 covers inspections, POD, signatures, offline, credit notes and invoice packs

The staging database now matches production and has passed real-identity security tests. It still
cannot validate a full release, for two reasons:
- No Edge Functions are deployed to staging (Gate 5).
- Vercel previews are still wired to production (Gates 6 and 8).

## Gates

| Gate | Result | Evidence |
|---|---|---|
| 1 Repository baseline | VERIFIED PASS | `origin/main` = `origin/staging` = `cf0c94e4…` (`git fetch` + `rev-parse`, 25 Nov) |
| 2 Recovery | VERIFIED PASS (limits below) | Encrypted archive restored into a disposable local PG 17.12 from ciphertext. 237/237 catalogue groups and 64/64 table digests identical. Live staging digests were re-checked as unchanged before the first write. |
| 3 Database parity | VERIFIED PASS with 2 documented exceptions | Live staging vs production: 425/425 groups present; 4 groups differ, covering the 2 exceptions below. Live staging = rehearsal exactly. Extensions and security advisors are identical to production. |
| 4 Security | VERIFIED PASS (DB/API scope) | 15/15 security tests over HTTP with real sign-ins (`scripts/staging/regression/http-regression.mjs`) |
| 5 Integrations | VERIFIED PASS (staging-safe; live integrations NOT TESTED) | 23/23 repository functions deployed from Git (`scripts/staging/deploy-staging-functions.sh`, commit `76d4875`). Bundle hashes match production for all 23 at `cf0c94e`, so there is zero source drift; 6 were redeployed with the e-mail guard. 7/7 function security tests pass with real JWTs. No provider secrets are set on staging, so e-mail, Google, GCS and DVLA are absent (fail closed), not live. |
| 6 Environment isolation | VERIFIED PASS for the staging deployment (residual risk below) | Branch-scoped preview vars on `deploy-preview/staging` only. Vercel build log: `building against project mfedxybzajdgavzmajkl (VITE_APP_ENV=staging)`. The deployed `client-*.js` contains the staging URL/key only. In a browser session, all requests went to staging or localhost. Residual risk: every other preview branch still inherits the production values. |
| 7 Regression | PARTIALLY COMPLETE | 30/30 HTTP tests and 2,082/2,082 unit tests pass. Inspections, POD, offline, signatures, credit notes and invoice packs were NOT TESTED (they need Edge Functions/storage). |
| 8 Deployment | VERIFIED PASS (limits below) | `dpl_GVQhaWKF1pMb2th4E8jNZPduXUQt` (preview, commit `a20a0ff`) is READY and serving: https://axentra-app-git-deploy-preview-staging-tafmannns-projects.vercel.app (Vercel Authentication protected). The identical build passed a Playwright sign-in as admin A and driver A against staging: correct org-scoped data, 0 page errors. |
| 9 Production protection | VERIFIED PASS | Only `SELECT`s against production. No production deploy, merge or config change. The Vercel project was only read. |

## Root cause of the staging failure

1. **Production objects exist that no migration creates.** The whole permission subsystem was built
   directly in production (Lovable/dashboard era) and was never committed as a migration:
   - tables `permissions_catalog`, `role_permission_templates`, `user_permission_overrides`, `permission_audit_log`
   - 16 functions, plus `auto_link_job_to_client` and `can_actor_manage_permission`
   - photo-link triggers, `jobs.client_id`, and two `app_settings` policies

   So replaying the repository can never reproduce production. Staging was "repaired" in July with
   hand-made `reconstructed_baseline_*` tables. Those drifted from production:
   - `invoices` money columns were unconstrained `numeric` instead of `numeric(10,2)`
   - wrong defaults and wrong FK `ON DELETE` actions
   - an extra `FOR ALL TO PUBLIC` org-wide `driver_profiles` policy, which is a **security hole on staging only**
2. **The ledger diverged.** MCP `apply_migration` stamps the *apply* time as the version. Staging
   versions therefore never matched repository versions, and `supabase db push` / `sync-staging-migrations.sh`
   could not reason about them. The workflow could never apply anyway (`STAGING_BACKUP_VERIFIED` is never set).
3. **Production carries a migration missing from Git.** `20261124223124_digital_id_dual_role_drivers`
   was in production's ledger only. It is now committed with the exact SQL production executed.
4. Staging stopped at `20260714120100`. Two November migrations were applied out of order.

## Method chosen: production-catalogue-anchored replay (hybrid of B and A)

Pure replay (A) fails at the first migration because of the out-of-band objects above. A full schema
diff (B alone) would drop the 7 legacy pricing columns without the backfill/seal logic. Rebuild (C)
needs a destructive reset. The sequence was rehearsed end-to-end on a restored copy before any write:

1. **Pre-reconcile.** `supabase/staging-reconcile/20261125100100_*` creates only the objects the chain
   presupposes, copied verbatim from the production catalogue. It also copies production reference
   rows: 27 permission keys and 57 role templates. These are global configuration, not user data.
2. **Replay.** The 47 missing repository migrations plus the production-only one run byte-for-byte.
3. **Post-reconcile.** `…100200` holds the residual, reviewed corrections. Every function that
   differed only cosmetically was proven identical after normalisation, then replaced with the
   production text.

**Apply mechanism.** Staging fetched each file from the pinned GitHub commit and verified its sha256
in-database before `EXECUTE`. Each group of files ran as a single transaction. Four guards were each
proven to refuse:
- a target marker (database comment)
- a structural first-mark guard
- a ledger no-reapply check
- an integrity check

The ledger now records **repository versions** plus `staging-reconcile git:<sha> sha256:<hash>`.
The temporary `http` extension was dropped afterwards; extensions match production.

## Inventory before → after (staging; production in brackets)

| | Before | After | Production |
|---|---|---|---|
| Public tables | 28 | 44 | 44 |
| Public functions | 30 | 93 | 93 |
| Buckets | 8 | 10 | 10 |
| Ledger rows | 77 | 128 | 122 |
| Catalogue groups missing / different vs production | 188 / 79 | 0 / 4 | — |

The ledger is larger than production's for two reasons:
- it keeps the 77 historical rows (2 marked `staging_only` and 3 `reconstructed_*`)
- it adds 3 `staging_only_*` rows

The 16 missing tables and 2 missing buckets listed in the brief were revalidated, then created.
All pre-existing staging rows survived; table digests were checked before and after. No legacy
pricing values existed, so the backfill correctly produced 0 `job_pricing` rows.

## Remaining schema exceptions (documented)
1. Column *order* differs in `jobs`, `invoices`, `driver_profiles`. All 156 column definitions are
   identical. Fixing the order would need a table rebuild.
2. `driver_profiles_user_id_fkey` is `NOT VALID` on staging. The one pre-existing row is an orphan
   from July 2026 with no auth user or profile. New writes are enforced. Owner decision: delete the
   orphan, then `VALIDATE CONSTRAINT`.

## Backup and restore
- **Method.** A read-only SQL logical export (`scripts/staging/logical-backup/`):
  - DDL, with exact composite row literals carried as base64
  - a per-table independent md5, with collation pinned to C
  - verified on extraction with md5 + length
- **Archive.** age X25519, `axentra-staging-20261125T185745Z.tar.age`, sha256 `fc1826d7…a5f`.
  It was given to the owner with the key sent separately. Neither is in Git.
- **Restore.** Into a loopback PG 17.12, single transaction, `ON_ERROR_STOP`. 237/237 groups and
  64/64 tables identical. Auth user/identity, the 77-row ledger and 8 buckets were recovered.
  Effective anon permissions matched live staging.
- **Limits:**
  - Supabase-managed auth/storage internals are provided by the platform, not restored.
  - Vault had 0 rows; storage.objects had 0 rows, so there were no files to recover.
  - The target was PG 17.12, not Supabase's 17.6 image (registry pulls were blocked).

## Security results (staging, real JWTs over HTTP)
All passed:
- anon reads/RPCs denied
- driver sees only own job
- org A/B isolation for jobs, clients and invoices
- super-admin inheritance
- suspended account gets no data and `ACCOUNT_INACTIVE`
- role/org self-escalation blocked (`PRIVILEGED_PROFILE_FIELDS`)
- driver job create/move blocked
- status override is super-admin only
- cross-org invoice allocation refused
- permission templates are not writable by drivers
- no private bucket listing for anon or other orgs
- portal users cannot use tables or admin RPCs

Fixtures: 9 synthetic users in 2 orgs on the `.test` domain (`scripts/staging/regression/fixtures.sql`).
The password exists only as a local secret.

## Functional results
Passed:
- job create → assign → driver visibility
- abort request (wrong driver denied) → admin confirm → `aborted`
- driver cannot approve own abort fee
- invoice numbers are sequential
- **duplicate invoice blocked** (`JOB_ALREADY_INVOICED`)
- 2dp rounding
- portal shows only own client's jobs; unsent invoices are hidden
- digital ID: auto-issue, own-only, admin same-org, dual-role

Not tested: inspections and evidence, signatures, offline retries, POD generation, completion/reopen,
abort fee correction, credit notes, revised invoices, invoice packs, photo management, revocation UI.

## Edge Functions
- **Deployed 25 Nov:** all 23 repository functions on staging, `verify_jwt=false` to mirror production. The deploy token cannot read production (HTTP 403), so it is effectively staging-scoped. Function tests:
  - `promote-admin` returns 410
  - `get-org-users` refuses anon/driver and stays org-scoped
  - `user-lifecycle` refuses driver/portal users
  - `portal-access` refuses cross-org admins
  - `gcs-proxy` refuses a cross-org path (403)
  - `notify-customers` refuses portal users and sends 0 on staging
  - `send-invoice-email` sent nothing (it rejected the request on input validation; the e-mail guard is proven by unit tests)
- **Inventory.** Production has 24 functions: the 23 repo functions plus **`verify-gcs-upload-fix`**,
  which is not in Git (production finding). All 24 run with `verify_jwt=false`; `config.toml`
  declares that for only 6. Source drift vs repo: **none**. Deploying `cf0c94e` to staging reproduced production's `ezbr_sha256` for all 23 functions.
- **Safety.** `_shared/deliveryGuard.ts` guards all 4 Resend send paths:
  - production is unchanged
  - staging sends only to `STAGING_EMAIL_ALLOWLIST` (default `axentra-staging.test`)
  - unknown projects send nothing

  This is unit-tested. Without secrets, staging functions fail closed; that is mocked/absent, not a
  live integration. Google, GCS and DVLA destinations still need staging-specific credentials.

## Environment isolation
- `src/lib/supabaseTarget.ts` runs at build (Vite) and at runtime (client):
  - refuses secret or service-role keys
  - refuses a key whose project differs from the URL's
  - requires `VITE_APP_ENV=staging` to use the staging project
  - requires a `staging` / `deploy-preview/staging` branch to declare staging
- **Proven:**
  - A staging build falling back to the committed production `.env` **fails**.
  - A correct staging build contains no production URL/key and no secrets.
  - A production build is unchanged.
- **Vercel today:**
  - `VITE_SUPABASE_URL/KEY` are one value scoped **production + preview**, so every preview uses production.
  - The Supabase integration placed production service-role, JWT-secret and Postgres credentials in
    the project (production scope).

## Blockers and minimum owner actions
Items 1 and 2 were completed on 25 Nov: functions are deployed, and the staging preview is deployed with branch-scoped variables. Still open:
- revoke the Supabase access token when you are finished with it (it cannot read production)
- add sandbox provider secrets
- narrow the production+preview `VITE_SUPABASE_*` variables to production only

1. **Edge Function deploy (Gate 5).** The only tool path pastes ~551 KB by hand, which is error-prone.
   Choose one:
   - (a) run `supabase functions deploy --project-ref mfedxybzajdgavzmajkl` locally from this branch, or
   - (b) provide a deploy path from Git, e.g. a CI secret.

   Then set staging-only secrets: test Resend key, sandbox Google/GCS project, `STAGING_EMAIL_ALLOWLIST`.
   Do not copy production secrets.
2. **Vercel (Gates 6/8).** Add *branch-scoped* preview variables for `deploy-preview/staging`:
   - `VITE_SUPABASE_URL=https://mfedxybzajdgavzmajkl.supabase.co`
   - the staging publishable key
   - `VITE_APP_ENV=staging`

   Then push `deploy-preview/staging`. Production variables stay untouched. Also consider narrowing
   the existing production+preview variables to production only, so no other preview reaches production.
3. **Owner review:** the orphan `driver_profiles` row; production's `verify-gcs-upload-fix` function;
   leaked-password protection being off in production Auth.

## Production findings (reported, not changed)
- The permission subsystem and other objects exist only in production, not in Git.
  Recommend an idempotent baseline-capture migration.
- `verify-gcs-upload-fix` is deployed in production but absent from Git.
- Leaked-password protection is disabled.
- The committed `.env` points at production, so any build missing variables talks to production.
  This is now guarded for staging builds.

## Bringing a newly approved production release into staging
1. `git fetch` and confirm `staging` equals the approved `main` commit (Gate 1).
2. Back up staging: run `export-schema.sql` + `export-data.sql` through the MCP, extract, encrypt,
   then run `restore-rehearsal.sh` + `verify-restore.sh`.
3. List new production ledger versions not present in the staging ledger. Staging now stores repository versions.
4. Rehearse on the restored copy with `render-group.py <commit> <files…>`.
5. Run `fp-compare.sh` against a fresh production fingerprint. Expect only the 2 documented exceptions.
6. Apply the same rendered groups to staging. Re-fingerprint and compare live staging to the rehearsal.
7. Run `http-regression.mjs`. Never use `apply_migration` for repository files: it re-breaks the ledger.

Detection of drift: re-run `fingerprint.sql` on both projects and compare. Any group other than the
documented exceptions is drift. Ledger drift: a production version missing from staging.
