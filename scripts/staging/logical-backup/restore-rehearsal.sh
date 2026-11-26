#!/usr/bin/env bash
# Restore a staging logical backup (export-schema.sql + export-data.sql output)
# into a DISPOSABLE local Postgres 17 and verify it. Never connects to a hosted
# database: the target must be a loopback address and the database name must
# start with "rehearsal_". Re-creates that database on every run.
#
# Usage: restore-rehearsal.sh <workdir-with-schema.sql+data.sql> <port> [dbname]
# Exits non-zero on the first SQL error (ON_ERROR_STOP, single transaction).
set -euo pipefail
WORK=${1:?workdir}; PORT=${2:?port}; DB=${3:-rehearsal_staging}
case "$DB" in rehearsal_*) ;; *) echo "BLOCKED: db name must start with rehearsal_"; exit 2;; esac
unset PGHOST PGHOSTADDR PGSERVICE PGPASSWORD DATABASE_URL STAGING_DB_URL SUPABASE_DB_URL
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres
for f in schema.sql data.sql schema.meta.json data.meta.json; do [ -s "$WORK/$f" ] || { echo "BLOCKED: missing $f"; exit 2; }; done
# Integrity: local files must still match the server-side digests recorded at export.
python3 -I - "$WORK" <<'EOF'
import hashlib, json, sys, os
w = sys.argv[1]
for n in ("schema", "data"):
    meta = json.load(open(os.path.join(w, n + ".meta.json")))
    body = open(os.path.join(w, n + ".sql"), encoding="utf-8", newline="").read()
    h = hashlib.md5(body.encode()).hexdigest()
    assert meta["expected_ref"] == "mfedxybzajdgavzmajkl", "not a staging export"
    assert h == meta["md5"], n + " digest mismatch"
print("archive integrity: schema+data digests match export manifest")
EOF
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "select 1" >/dev/null
[ "$(psql -X -Atq -d postgres -c "select inet_server_addr()::text")" = "127.0.0.1/32" ] || { echo "BLOCKED: not loopback"; exit 2; }
# Network-capable extensions must not exist in the rehearsal cluster.
psql -X -Atq -d postgres -c "select name from pg_available_extensions where name in ('pg_net','http','pg_cron','dblink','postgres_fdw')" | grep -q . \
  && echo "WARN: network-capable extensions are installable locally; dump never creates them"
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB template template0 encoding 'UTF8' locale 'C.UTF-8'"
{
  echo "set check_function_bodies = off; set client_min_messages = warning;"
  cat "$WORK/schema.sql"
  echo; echo "set session_replication_role = replica;"
  cat "$WORK/data.sql"
  echo; echo "set session_replication_role = origin;"
} | psql -X -q -v ON_ERROR_STOP=1 --single-transaction -d "$DB" > "$WORK/restore.log" 2>&1 || { tail -20 "$WORK/restore.log"; echo "RESTORE FAILED"; exit 1; }
echo "RESTORE OK into $DB on 127.0.0.1:$PORT"
