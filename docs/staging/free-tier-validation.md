# Axentra free-tier staging workaround — release validation

**Scope:** GitHub Actions disposable local Supabase + read-only inventory of the existing `axentra-staging` project. No paid Supabase branching; no automatic remote database changes.

## Status and critical honesty

- The protected repository branch and GitHub CI can run with no hosted database credentials, but full parity is **not yet established**.
- Known baseline (24 November 2026): production has 120 migration-history rows, staging 77. Staging is missing the `job_aborts` and Digital ID credential tables; this is a real compatibility blocker.
- `supabase db start` runs a disposable local Postgres instance with the current repository migration files, not production data. **A passing local test is necessary but not sufficient for a production deployment.**
- The local backup/restore probe only proves the local dump/restore tooling works with synthetic data. **It is NOT a hosted staging backup**.
- The optional hosted inventory job requires an environment named `staging-validation` and a secret named `STAGING_DB_URL`. It uses a strict staging-only allowlist and read-only PostgreSQL session. Missing/unusable credentials fail closed; it never reports a fake PASS.

## What runs automatically on migration-focused PRs

`.github/workflows/free-tier-supabase.yml` checks:

1. Staging-target protection, migration-file inventory and history alias logic (without connecting to a database).
2. Starts an isolated local Supabase database using a fixed CLI version; applies repository migrations.
3. Asserts core public tables, job abort RPC and row-level security exist.
4. Executes existing abort scenario tests, which begin a transaction and roll it back.
5. Dumps and restores a synthetic table on the local database, asserting exact row fidelity. It deletes its temporary dump afterwards.

The job is intentionally **red** if migrations cannot replay or a permission assertion fails. Do not bypass or convert a FAIL into NOT_EXECUTED.

## Optional hosted staging inventory, no cost for a paid branch

Configure an environment `staging-validation` in GitHub and place the existing staging database URL in its `STAGING_DB_URL` secret. Use a session pooler URL on port 5432 with username `postgres.mfedxybzajdgavzmajkl` or the exact direct staging host. Keep this URL out of chat, PR descriptions, logs and repository files.

From Actions, manually run **Free-Tier Supabase Verification** and select `remote_inventory=true`. The read-only report lists migration-history mismatch, schema counts and critical missing tables; its failure status is expected until a reviewed reconciliation is completed. It cannot perform or approve migration repair.

## Verifying an actual hosted staging backup (separate required gate)

1. Use an authenticated database export tool on a trusted machine or tightly protected, approved CI environment to dump staging schema, roles, migration history and data into encrypted private storage. Supabase Free does not provide automatic managed backups or PITR.
2. Include any required storage objects via their API in a separate private backup; database rows alone do not contain object bytes.
3. Restore that snapshot to a **new disposable local database** with compatible roles/extensions, never to the hosted staging or production project.
4. Verify table counts, representative synthetic fixtures, migration history, RLS definitions and Storage object references against the snapshot. Record backup creation time, checksum, restore time, test ID, errors and independent reviewer.
5. Only then mark `STAGING_BACKUP_VERIFIED` in the release record. Do not claim the local synthetic backup probe meets this condition.

**Never** add database passwords, dump files, user credentials, JWTs, exported personal information or private storage to GitHub artifacts or repo. GitHub Actions logs and artifacts must remain free of secrets and customer data.

## Repairing staging drift safely

The existing `scripts/sync-staging-migrations.sh` performs simple filename/history matching and **must not** be used to bulk-apply missing migrations to a reconstructed staging schema. Staging has history aliases, diverged definitions and legacy changes. Resolve one migration at a time after schema diff, reviewed SQL plan, restorable backup, and a fail-closed smoke test. Run a real authenticated Admin A / Driver A / Admin B permission matrix and photo upload tests before enabling Digital ID V2.

Release order: disposable CI green → actual staging backup and restore verified → staging schema parity repaired → live negative REST/RPC/Storage checks pass → browser/iPhone visual QA → PR gate green → separate production release approval.

Useful documentation:
- https://supabase.com/docs/guides/deployment/ci/testing
- https://supabase.com/docs/guides/local-development/cli/migrating-to-v3
- https://supabase.com/docs/guides/platform/backups

## Rollback and limits

This infrastructure PR touches only workflow files, validation scripts and documentation. Reverting it stops the added CI checks; existing production and staging data do not change. The local tests consume GitHub Actions minutes and GitHub-hosted Docker resources, not a Supabase paid branch or Vercel deployments. CI quotas and rate limits still apply. This runbook does not authorize merging application features or deploying production migrations.
