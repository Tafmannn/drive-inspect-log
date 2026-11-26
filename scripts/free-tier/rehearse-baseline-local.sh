#!/usr/bin/env bash
# Local rehearsal of the CI database job WITHOUT the Supabase CLI images:
# disposable postgres:17 container on 127.0.0.1:54322 + platform shim, then the
# same restore / verify / scenario steps as .github/workflows/free-tier-db.yml.
# Destroys and recreates the container "axentra-rehearsal" on every run.
set -euo pipefail
cd "$(dirname "$0")/../.."
docker rm -f axentra-rehearsal >/dev/null 2>&1 || true
docker run -d --name axentra-rehearsal -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:54322:5432 postgres:17 >/dev/null
[[ "${KEEP_REHEARSAL:-}" == 1 ]] || trap 'docker rm -f axentra-rehearsal >/dev/null 2>&1 || true' EXIT
export AXENTRA_DISPOSABLE_DB=YES PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGDATABASE=postgres PGPASSWORD=postgres
for _ in $(seq 1 60); do psql -X -Atqc "select 1" >/dev/null 2>&1 && break; sleep 1; done
psql -X -q -v ON_ERROR_STOP=1 -f scripts/free-tier/platform-shim.sql 2>/dev/null
bash scripts/free-tier/restore-production-baseline.sh
node scripts/free-tier/verify-local-db.mjs | tail -3
bash scripts/free-tier/run-local-scenarios.sh
echo "REHEARSAL PASS"
