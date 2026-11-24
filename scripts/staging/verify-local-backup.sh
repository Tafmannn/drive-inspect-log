#!/usr/bin/env bash
# Local, disposable, synthetic backup/restore probe. NEVER points to a hosted DB.
set -Eeuo pipefail
if [[ "${AXENTRA_LOCAL_TEST_DB:-}" != "YES" ]]; then
  echo "REFUSED: AXENTRA_LOCAL_TEST_DB=YES is required" >&2
  exit 2
fi
if [[ -n "${STAGING_DB_URL:-}" || -n "${DATABASE_URL:-}" || -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "REFUSED: hosted or custom DB URL present in local restore job" >&2
  exit 2
fi
for binary in psql pg_dump pg_restore; do
  command -v "$binary" >/dev/null || { echo "Missing $binary" >&2; exit 2; }
done
export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGDATABASE=postgres PGPASSWORD=postgres
export PGSSLMODE=disable PGCONNECT_TIMEOUT=5
# Refuse a misconfigured PostgreSQL endpoint.
[[ "$PGHOST" == "127.0.0.1" && "$PGPORT" == "54322" ]] || exit 2
tmp="$(mktemp -d)"
cleanup() {
  psql -X -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA IF EXISTS axentra_backup_probe CASCADE' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
psql -X -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE SCHEMA axentra_backup_probe;
CREATE TABLE axentra_backup_probe.proof(id integer PRIMARY KEY, payload text NOT NULL);
INSERT INTO axentra_backup_probe.proof VALUES (1, 'axentra-backup-restore-proof');
SQL
pg_dump -Fc --no-owner --no-privileges --schema=axentra_backup_probe -f "$tmp/probe.dump"
[[ -s "$tmp/probe.dump" ]] || { echo "Backup is empty" >&2; exit 1; }
pg_restore --list "$tmp/probe.dump" >/dev/null
psql -X -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA axentra_backup_probe CASCADE'
pg_restore --exit-on-error --no-owner --no-privileges --dbname=postgres "$tmp/probe.dump" >/dev/null
actual="$(psql -X -A -t -q -v ON_ERROR_STOP=1 -c "SELECT payload FROM axentra_backup_probe.proof WHERE id = 1")"
[[ "$actual" == "axentra-backup-restore-proof" ]] || { echo "Local restore did not reproduce the test row" >&2; exit 1; }
echo "PASS: disposable LOCAL synthetic table backup and restore."
echo "NOTE: This does NOT verify a backup of the hosted staging database."
