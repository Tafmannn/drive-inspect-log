#!/usr/bin/env bash
# Restore the reviewed production baseline into a DISPOSABLE local database,
# then replay only the repository migrations production has not recorded.
#
#   supabase/bootstrap/verified-production-baseline.sql            (schema + ledger)
#   supabase/bootstrap/verified-production-baseline.manifest.json  (sha256, approval)
#
# Fails closed when:
#   * the target is not the disposable local database (127.0.0.1:54322, AXENTRA_DISPOSABLE_DB=YES)
#   * the baseline does not match its manifest sha256, or is not approved for CI
#   * production's ledger holds a version that is not in supabase/migrations
#     (a change was applied to production without being committed: drift)
#   * any baseline statement or replayed migration errors (ON_ERROR_STOP)
#
# Each replayed migration runs in its own transaction and is then recorded in
# supabase_migrations.schema_migrations, exactly as `supabase db push` would.
set -euo pipefail
if [[ "${AXENTRA_DISPOSABLE_DB:-}" != YES || "${PGHOST:-}" != 127.0.0.1 || "${PGPORT:-}" != 54322 ]]; then
  echo "REFUSED: baseline restore requires the disposable local database only" >&2
  exit 2
fi
export PGUSER=postgres PGDATABASE=postgres PGPASSWORD="${PGPASSWORD:-postgres}" PGSSLMODE=disable
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="$ROOT/supabase/bootstrap/verified-production-baseline.sql"
MANIFEST="$ROOT/supabase/bootstrap/verified-production-baseline.manifest.json"
MIG="$ROOT/supabase/migrations"
[[ -s "$BASE" && -s "$MANIFEST" ]] || { echo "BLOCKED: baseline or manifest missing" >&2; exit 2; }

node - "$BASE" "$MANIFEST" <<'EOF'
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const [base, manifestPath] = process.argv.slice(2);
const m = JSON.parse(readFileSync(manifestPath, "utf8"));
const sha = createHash("sha256").update(readFileSync(base)).digest("hex");
const fail = (msg) => { console.error("BLOCKED: " + msg); process.exit(2); };
if (m.projectRef !== "lynkvfduzqdyvlzgriyh") fail("manifest is not for the production project");
if (m.sha256 !== sha) fail(`baseline sha256 ${sha} does not match manifest ${m.sha256}`);
if (m.approvedForCi !== true || m.securityReviewed !== true) fail("baseline is not approved for CI");
console.log(`baseline verified: sha256 ${sha.slice(0, 16)}…, production ledger at ${m.maxRecordedMigration} (${m.ledgerRows} rows), captured ${m.capturedAt}`);
EOF

# Drift check BEFORE touching the database: every production version must be in Git.
prod_versions="$(grep -oE "schema_migrations \(version, name\) VALUES \('[0-9]{14}'" "$BASE" | grep -oE "[0-9]{14}" | sort -u)"
repo_versions="$(ls "$MIG" | grep -oE '^[0-9]{14}' | sort -u)"
drift="$(comm -23 <(echo "$prod_versions") <(echo "$repo_versions") || true)"
if [[ -n "$drift" ]]; then
  echo "BLOCKED: production recorded migrations that are not in supabase/migrations (commit them first):" >&2
  echo "$drift" >&2
  exit 3
fi

{
  echo "SET check_function_bodies = off;"
  echo "SET client_min_messages = warning;"
  cat "$BASE"
} | psql -X -q -v ON_ERROR_STOP=1 --single-transaction >/dev/null
echo "baseline restored: $(echo "$prod_versions" | grep -c .) production ledger versions"

replayed=0
for f in $(ls "$MIG"/*.sql | sort); do
  v="$(basename "$f" | cut -c1-14)"
  name="$(basename "$f" .sql | cut -c16-)"
  if psql -X -A -t -v ON_ERROR_STOP=1 -c "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$v'" | grep -q 1; then
    continue
  fi
  echo "replaying $(basename "$f")"
  psql -X -q -v ON_ERROR_STOP=1 --single-transaction -f "$f"
  # psql only interpolates :'var' in statements read from a file/stdin, not -c.
  psql -X -q -v ON_ERROR_STOP=1 -v v="$v" -v n="$name" \
    <<< "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (:'v', :'n');"
  replayed=$((replayed + 1))
done
echo "PASS: production baseline restored; $replayed post-baseline migration(s) replayed"
