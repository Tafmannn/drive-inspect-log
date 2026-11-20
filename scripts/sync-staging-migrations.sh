#!/usr/bin/env bash
# Apply repo migrations that staging is missing, in order, one transaction
# each, recording each in supabase_migrations.schema_migrations.
#
# Why not `supabase db push`: staging's history was rebuilt on 12-13 Jul 2026
# with apply-time versions and the ORIGINAL version kept as the name prefix
# (e.g. version 20260713223138, name "20260713220000_invoices_admin_only_writes"),
# plus "reconstructed_baseline_*" rows. The CLI only compares versions, so it
# would treat every repo migration as missing.
#
# Usage: STAGING_DB_URL=... scripts/sync-staging-migrations.sh [--apply]
# Default is a dry run that only lists what would be applied.
set -euo pipefail

DB="${STAGING_DB_URL:?STAGING_DB_URL is required}"
APPLY="${1:-}"
PROD_REF="lynkvfduzqdyvlzgriyh"
MIG_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"

if [[ "$DB" == *"$PROD_REF"* ]]; then
  echo "REFUSING: STAGING_DB_URL points at the production project ($PROD_REF)." >&2
  exit 2
fi

# Versions staging already has: the 14-digit prefix of each name when present,
# otherwise the version itself.
applied="$(psql "$DB" -v ON_ERROR_STOP=1 -Atc \
  "select coalesce(substring(name from '^([0-9]{14})_'), version) from supabase_migrations.schema_migrations")"

pending=()
for f in $(ls "$MIG_DIR"/*.sql | sort); do
  base="$(basename "$f" .sql)"
  v="${base:0:14}"
  if ! grep -qx "$v" <<<"$applied"; then pending+=("$f"); fi
done

echo "Staging is missing ${#pending[@]} migration(s):"
for f in "${pending[@]}"; do echo "  $(basename "$f")"; done

if [[ "$APPLY" != "--apply" ]]; then
  echo "Dry run only. Re-run with --apply to apply them."
  exit 0
fi

for f in "${pending[@]}"; do
  base="$(basename "$f" .sql)"
  v="${base:0:14}"
  name="${base:15}"
  echo "→ applying $base"
  # One transaction per migration: the file and its history row commit together.
  {
    echo "BEGIN;"
    cat "$f"
    echo ";"
    echo "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('$v', '$name');"
    echo "COMMIT;"
  } | psql "$DB" -v ON_ERROR_STOP=1 -q
done
echo "Done: applied ${#pending[@]} migration(s)."
