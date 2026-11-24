# Phase 00 — manual staging backup and recovery gate

Date: 2026-11-24. Scope: Batch 00/A1, staging only. GitHub repository metadata reports public visibility. Never put database dumps, database passwords, authentication records, backup keys or encrypted backup archives into the repository or its workflow artifacts. No production database access for this task.

Supabase Free Plan dashboard confirms scheduled backups are unavailable. Use local logical backups as documented by Supabase:
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/docs/guides/self-hosting/restore-from-platform

## Export
Prerequisites: computer with Node, Supabase CLI, Docker, psql, tar and age. Use a private terminal, with the staging session-pooler or direct DB URL supplied securely in STAGING_DB_URL. Do not paste the URL into chat, commit it, or expose it in logs. Stop all staging activity during the export and verification window; separate CLI dumps are not a single transactional snapshot. The script refuses non-staging endpoints, CI runners and output inside the checkout. It encrypts and roundtrip-checks the archive; no remote writes. Example on macOS/Linux:

```sh
mkdir -p "$HOME/axentra-private-backups"
chmod 700 "$HOME/axentra-private-backups"
node scripts/staging/phase00-backup.mjs --self-test
# Load STAGING_DB_URL from local secret manager, not a committed .env.
node scripts/staging/phase00-backup.mjs "$HOME/axentra-private-backups"
```

Store the encrypted archive in a secure private backup location separate from the passphrase. Retain it until staging recovery and A1 verification are complete. The temporary plaintext workspace is mode 0700; this is not secure erasure, so use encrypted local disk. Script success proves archive roundtrip only, NOT database restore.

## Restore rehearsal — mandatory gate
1. Create a NEW disposable local Supabase/Postgres 17 instance with matching extension and managed Auth/Storage schema versions. Do not restore into staging, production or an existing development database. No hosted credentials in restore environment. Disable outbound network, cron and webhook execution; use local-only isolated services.
2. Decrypt the age archive into a private temporary workspace outside Git. Compare all four file SHA-256 values against manifest.json. Restore roles/schema/data following official self-hosted restore procedure; use a single transaction, ON_ERROR_STOP and session_replication_role=replica for data load. No skipped errors or silently discarded records. Resolve differences in a fresh disposable instance. Managed auth/storage custom definitions/policies and migration ledger must be compared separately; the standard CLI schema dump excludes managed schemas by default. Rebuild/verify those custom definitions and ledger from inspected source and captured metadata before treating this as recoverable.
3. Compare record counts, catalogue fingerprints, effective permissions, constraints and representative recovery queries with source. Confirm auth users and migration history are accounted for. Validate external GCS and object storage inventory separately, even if storage.objects was empty. Verify recovery of any required external files and configuration, not just DB rows.
4. Record actual restore result, snapshot checksum, environment, limitations and evidence. Remove plaintext scratch files. Keep the encrypted archive securely.
5. Do not set STAGING_BACKUP_VERIFIED=YES until restore and necessary file recovery have actually passed. Do not apply the 46 outstanding migrations until this gate passes and the baseline is reconciled. No main merge, production deployment or production data changes.

## Truth status
Backup script committed for local execution; actual database export, encrypted archive creation, restore, and full regression tests NOT executed by this commit. Current connector supports metadata queries but not pg_dump or CLI credentials. No secrets or backup artifacts in Git.
