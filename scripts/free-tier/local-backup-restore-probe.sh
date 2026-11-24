#!/usr/bin/env bash
# Synthetic LOCAL backup restoration, not verification of hosted staging.
set -euo pipefail
if [[ "$AXENTRA_DISPOSABLE_DB" != YES || "$PGHOST" != 127.0.0.1 || "$PGPORT" != 54322 ]]; then
  echo "REFUSED: disposable local backup probe only" >&2
  exit 2
fi
export PGUSER=postgres PGDATABASE=postgres PGPASSWORD=postgres PGSSLMODE=disable
name=axentra_restore_probe
scratch="$(mktemp -d)"
cleanup() {
  psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "DROP SCHEMA IF EXISTS axentra_backup_probe CASCADE" >/dev/null 2>&1 || true
  psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $name WITH (FORCE)" >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT
psql -X -q -v ON_ERROR_STOP=1 -c "CREATE SCHEMA axentra_backup_probe"
psql -X -q -v ON_ERROR_STOP=1 -c "CREATE TABLE axentra_backup_probe.fixture(id int PRIMARY KEY, label text NOT NULL)"
psql -X -q -v ON_ERROR_STOP=1 -c "INSERT INTO axentra_backup_probe.fixture VALUES (1,'synthetic-only')"
docker run --rm --network host -e PGPASSWORD=postgres postgres:17 \
  pg_dump -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  --format=custom --schema=axentra_backup_probe --no-owner --no-acl > "$scratch/probe.dump"
test -s "$scratch/probe.dump"
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE $name"
docker run --rm --network host -i -e PGPASSWORD=postgres postgres:17 \
  pg_restore -h 127.0.0.1 -p 54322 -U postgres -d "$name" --no-owner --no-acl < "$scratch/probe.dump"
value="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$name" -c "SELECT label FROM axentra_backup_probe.fixture WHERE id=1")"
[[ "$value" == synthetic-only ]] || { echo "FAILED: backup restored wrong data" >&2; exit 1; }
echo "PASS: actual pg_dump/pg_restore round trip of synthetic LOCAL data"
echo "HOSTED STAGING BACKUP: NOT VERIFIED"
