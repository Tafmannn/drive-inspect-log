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
# Default is a dry run. Applying also requires STAGING_BACKUP_VERIFIED=YES and
# a connection URL containing the known staging project ref (never production).
set -euo pipefail

DB="${STAGING_DB_URL:?STAGING_DB_URL is required}"
APPLY="${1:-}"
PROD_REF="lynkvfduzqdyvlzgriyh"
STAGING_REF="mfedxybzajdgavzmajkl"
MIG_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"

if [[ "$DB" == *"$PROD_REF"* ]]; then
  echo "REFUSING: STAGING_DB_URL points at the production project ($PROD_REF)." >&2
  exit 2
fi

# Staging's rebuilt history has three naming conventions:
# 1. Original timestamp stored at the front of "name"
# 2. Original version used as "version"
# 3. Two later migration names stored as bare slugs with rewritten versions.
# Include exact bare-name markers too, to avoid replaying already-applied DDL.
# The repository has no duplicate migration slugs (checked in regression tests).
applied="$(psql "$DB" -v ON_ERROR_STOP=1 -Atc \
  "select coalesce(substring(name from '^([0-9]{14})_'), version)
     from supabase_migrations.schema_migrations
   union all
   select 'name:' || name
     from supabase_migrations.schema_migrations
    where name !~ '^[0-9]{14}_'")"

pending=()
for f in $(ls "$MIG_DIR"/*.sql | sort); do
  base="$(basename "$f" .sql)"
  v="${base:0:14}"
  slug="${base:15}"
  if ! grep -Fxq "$v" <<<"$applied" && ! grep -Fxq "name:$slug" <<<"$applied"; then
    pending+=("$f")
  fi
done

echo "Staging is missing ${#pending[@]} migration(s):"
for f in "${pending[@]}"; do echo "  $(basename "$f")"; done

if [[ -n "$APPLY" && "$APPLY" != "--apply" ]]; then
  echo "Unsupported argument: $APPLY (use --apply or no argument)." >&2
  exit 2
fi

if [[ "$APPLY" != "--apply" ]]; then
  echo "Dry run only. Re-run with --apply after a verified staging backup."
  exit 0
fi

# Explicitly constrain writes to the current staging project. A pooler URL
# embeds the ref in its database username (postgres.<ref>), and a direct URL
# embeds it in the host. Never rely on the absence of the production ref alone.
if [[ "$DB" != *"$STAGING_REF"* ]]; then
  echo "REFUSING: apply requires a connection URL containing staging ref $STAGING_REF." >&2
  exit 2
fi

if [[ "${STAGING_BACKUP_VERIFIED:-}" != "YES" ]]; then
  echo "REFUSING: confirm a restorable staging backup before applying (STAGING_BACKUP_VERIFIED=YES)." >&2
  exit 3
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
