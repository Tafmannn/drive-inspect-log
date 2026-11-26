# Axentra: controlled Vercel deployments

## Why

On 23 Nov 2026, repetitive commits across abort-workflow development branches created many Vercel preview deployment records, including cancelled and failed builds. Git commits are useful; unnecessary Vercel deployments are not.

## Effective Git policy

Vercel reads `vercel.json` for Git-integrated deployments:

- `main`: **deploy automatically to production**.
- `deploy-preview/<slug>`: **deploy a preview automatically when deliberately selected**.
- Every other branch, including `chatgpt/*`, `claude/*`, `fix/*`, `feature/*`, and legacy staging branches: **no automatic Git deployment**.

The `git.deploymentEnabled` rules use Vercel's documented minimatch branch patterns, with a matching `true` taking precedence over matching `false`. The catch-all `**` denies routine branches, while the two allowlisted patterns opt in.

## Normal agent development

1. Branch from up-to-date `main`. Older branches must incorporate the new `vercel.json` policy before pushing; Vercel can evaluate configuration from the pushed commit.
2. Make related source changes; run relevant tests and `npm run typecheck`/`npm run build` where feasible.
3. Push code to the normal development branch and open a PR. GitHub Actions validates it without requiring a Vercel preview.
4. Merge only when the owner authorises the production release; `main` deploys once for the merge.

## Deliberate preview

1. Use or create a branch named `deploy-preview/<slug>` based on the current `main`.
2. Apply tested changes to that branch and push when a reviewable preview is needed.
3. Review the generated Vercel preview URL. Continue normal changes off the preview branch to avoid creating unneeded builds.
4. Delete/retire the temporary preview branch when finished; changes still reach production only via an authorised merge to `main`.

## Bypasses, limitations and monitoring

- Vercel CLI/REST/deploy-hook requests are **not** inherently prevented by Git branch configuration. Agents must not call those without explicit deploy authorisation; Vercel project permissions/policies can provide separate enforcement.
- Existing branches with outdated `vercel.json` may still trigger deployments until updated from `main`; monitor their first push after rollout.
- This is not a rate limiter, GitHub commit limiter or approval-gate replacement. Repeated pushes to `main` or `deploy-preview/*` still deploy.
- Cancelling/skipping an already-created build need not refund any deployment allowance. Read actual usage/plan limits in Vercel before assuming budget is available.
- Existing GitHub Actions validation workflows stay in place, and frontend deployment does not apply Supabase migrations.

## Previews never reach production data by accident

The build check (`src/lib/supabaseTarget.ts`, run by `vite.config.ts`) requires **every** Vercel preview build to declare and target staging. That includes a preview that would otherwise fall back to the committed production `.env`. There is no opt-in for previews on production data.

Give each `deploy-preview/<slug>` branch-scoped preview variables in Vercel: the staging `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, plus `VITE_APP_ENV=staging`, as `deploy-preview/staging` has.

A Vercel production build must target the production project. Production builds from `main` are otherwise unchanged.

## Releasing database migrations and Edge Functions

Merging to `main` deploys only the web app. Migrations and Edge Functions are released separately, from `main`, with **Actions → Production database and functions release**:

1. Write migrations **expand-first**, so the app currently live keeps working before and after they apply.
2. Merge the migration PR. Its CI ran every SQL test on a copy of production's schema (see below).
3. Run the release workflow. Leave the boxes unticked to see the dry run, then run it again with **apply migrations** ticked.
4. Tick **deploy functions** when `supabase/functions` changed. `verify_jwt` for every function comes from `supabase/config.toml` (all `false`, matching production; a unit test enforces that every function is declared).
5. Merge app code that depends on the new schema only after step 3.

Never apply repository migrations with the Supabase MCP `apply_migration` tool or the SQL editor. They record a different version, and production then disagrees with Git.

**One-time setup:**
- Create a GitHub environment named `production` with yourself as required reviewer.
- Add secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` to that environment.

## Detecting production drift

**Production migration drift (read-only)** runs weekly and after every migration merge. It compares production's ledger with `supabase/migrations`:
- It **fails** when production has a migration that is not in Git.
- It **warns** when merged migrations are still waiting for release.

It needs a read-only credential, stored as repository secret `PRODUCTION_READONLY_DB_URL`. Without it, the check reports NOT EXECUTED. To create a minimal role, run this once in the production SQL editor with a strong password, then build a pooler URL for it:

```sql
CREATE ROLE ci_ledger_reader LOGIN PASSWORD '<strong password>';
GRANT USAGE ON SCHEMA supabase_migrations TO ci_ledger_reader;
GRANT SELECT ON supabase_migrations.schema_migrations TO ci_ledger_reader;
```

## How CI tests the database

Production holds objects that no migration creates, so the historical chain cannot be replayed from an empty database. Instead, CI does this:

1. Restores `supabase/bootstrap/verified-production-baseline.sql`, a reviewed, schema-only capture of production. It contains no customer data, only bucket and permission configuration.
2. Replays only the migrations production has not recorded.
3. Runs `supabase/tests`.

The restore refuses in three cases:
- The baseline does not match the sha256 in its manifest.
- The baseline is not approved.
- Production recorded a migration that is missing from Git.

To rehearse it locally with Docker, run `bash scripts/free-tier/rehearse-baseline-local.sh`.

**Refreshing the baseline** is optional, because new migrations replay on top automatically. Re-capture it after any change made to production outside `supabase/migrations`:
1. Run `scripts/free-tier/export-production-baseline.sql` read-only through the Supabase MCP or SQL editor.
2. Extract it with `scripts/staging/logical-backup/extract-mcp-result.py --ref=lynkvfduzqdyvlzgriyh`.
3. Review it for secrets.
4. Rehearse it locally.
5. Update the manifest's `sha256`, `capturedAt` and approval fields.

## Policy check and rollback

Run `node scripts/check-vercel-deployment-policy.mjs` before changing the rules. CI also runs this check on PRs and `main`.

To revert this **configuration change only**, remove `git.deploymentEnabled` from `vercel.json`, restore the prior CI/workflow documentation as appropriate, and redeploy `main`. That restores automatic previews on feature branches and can reintroduce quota spikes. Never change the SPA rewrite rule as part of rollback.
