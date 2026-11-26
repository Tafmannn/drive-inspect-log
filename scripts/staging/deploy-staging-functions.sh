#!/usr/bin/env bash
# Deploy the repository's Edge Functions to STAGING ONLY, byte-for-byte from a
# pushed Git commit (clean worktree, no local edits).
#
# Usage: scripts/staging/deploy-staging-functions.sh <commit-sha> [function ...]
# Requires the Supabase CLI and an access token (SUPABASE_ACCESS_TOKEN, or a
# proxy that injects it). verify_jwt is disabled to mirror production, where
# every function enforces caller identity in code (release-validation suite 06).
set -euo pipefail
STAGING_REF="mfedxybzajdgavzmajkl"
PROD_REF="lynkvfduzqdyvlzgriyh"
COMMIT=${1:?commit sha}; shift || true
SUPABASE=${SUPABASE_BIN:-supabase}
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "BLOCKED: full commit sha required"; exit 2; }
[[ "${SUPABASE_PROJECT_REF:-$STAGING_REF}" == "$STAGING_REF" ]] || { echo "BLOCKED: staging only"; exit 2; }
git branch -r --contains "$COMMIT" | grep -q . || { echo "BLOCKED: commit is not on any pushed branch"; exit 2; }

WT=$(mktemp -d); trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
git worktree add --detach "$WT" "$COMMIT" >/dev/null
cd "$WT"
grep -rq "$PROD_REF" supabase/functions --include=*.ts && echo "NOTE: production ref appears in function source (constants only are expected)"
FUNCS=("$@")
[ ${#FUNCS[@]} -gt 0 ] || mapfile -t FUNCS < <(find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_*' -printf '%f\n' | sort)
fail=0
for f in "${FUNCS[@]}"; do
  [ -f "supabase/functions/$f/index.ts" ] || { echo "SKIP $f (no index.ts)"; continue; }
  if "$SUPABASE" functions deploy "$f" --project-ref "$STAGING_REF" --use-api --no-verify-jwt >"/tmp/deploy-$f.log" 2>&1; then
    echo "DEPLOYED $f"
  else
    echo "FAILED $f"; tail -5 "/tmp/deploy-$f.log"; fail=1
  fi
done
exit $fail
