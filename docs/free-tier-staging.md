# Axentra free-tier staging / database release gates

## What is now automated without Supabase Pro

- The **Free-tier disposable Supabase DB** GitHub Actions workflow starts a disposable Postgres container on a GitHub runner. It applies all repository migration files, checks migration history and critical RLS, runs existing invoice and abort SQL scenarios, and requires a Digital ID SQL scenario when that feature's migration is present.
- A synthetic-only backup/restore probe creates one throwaway row, takes a real PostgreSQL 17 custom-format dump, restores it into a separate disposable database, and verifies the restored row.
- No Supabase hosted credentials are passed to the PR job. No production code is deployed by this workflow. GitHub-hosted CI minutes are subject to the account's included allowance.
- A **manual** staging metadata workflow performs read-only checks, and refuses anything but the exact Axentra staging project. It needs the GitHub secret STAGING_DB_URL; if absent, the job fails rather than faking successful validation.

## What remains unsafe / blocked

The local synthetic backup probe does **not** count as a verified restore of the real hosted staging database. Real staging had 77 migration records versus production's 120 at the 24 November audit; version aliases mean raw record counts are not an exact diff. Staging lacked the abort workflow table and Digital ID tables. Migrations must not be replayed blindly.

Before writing any migration to hosted staging:
1. Export a genuine staging-only database backup, protected by encryption and stored outside the repository. A Supabase SQL dump does not contain the *bytes* of Storage objects; export those separately.
2. Restore the actual backup to an isolated disposable compatible database and verify schema, row counts, RLS, triggers, auth records and the separately exported Storage objects. Merely running pg_restore --list is not proof.
3. Record the backup reference, checksum, restore evidence, and approved migration-by-migration reconciliation. Avoid any production credentials in CI or chat.
4. Run real Auth/Storage negative tests with synthetic driver, admin and cross-organisation accounts. SQL role simulation by itself is insufficient.

## Running a test

GitHub: open a PR that changes supabase/migrations, supabase/tests or scripts/free-tier and inspect **Free-tier disposable Supabase DB**. The workflow can also be manually dispatched after it is on the repository default branch.

On a machine with Docker, Postgres client and Supabase CLI, set AXENTRA_DISPOSABLE_DB=YES, PGHOST=127.0.0.1, PGPORT=54322, PGUSER=postgres, PGDATABASE=postgres, PGPASSWORD=postgres; then execute supabase db start, node scripts/free-tier/verify-local-db.mjs, bash scripts/free-tier/run-local-scenarios.sh, and bash scripts/free-tier/local-backup-restore-probe.sh. Run only against throwaway local Supabase.

When the staging connection is stored as the STAGING_DB_URL secret, manually run **Axentra staging metadata preflight (read-only)**. Do not configure any secret containing the production project ref.

## Release rules

- A green local database run validates migration replay and SQL scenarios, not the remote staging environment.
- The Digital ID feature must also pass real browser/iPhone visual QA, real authenticated API/Storage/RLS tests, actual staging recovery and reconciliation, CI quality gate, and production release approval. Leave its feature flag OFF until verification is complete.
- No automatic prod deploy, merger, hosted database migration, backup assertion or reset is authorised by passing the local tests.
- To roll back this testing infrastructure, revert the workflow and scripts only; it makes no persistent hosted Supabase changes.

See official Supabase CLI docs: https://supabase.com/docs/guides/deployment/ci/testing and https://supabase.com/docs/guides/platform/backups.
