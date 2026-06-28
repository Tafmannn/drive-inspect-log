#!/usr/bin/env bash
#
# apply-phase1-staging.sh — gated, STAGING-ONLY rollout of Phase 1.
#
# This script NEVER targets production. It applies one stage at a time and
# refuses to advance until you confirm that stage's verification passed.
# It does NOT rotate keys and does NOT run any production command.
#
# Required env:
#   STAGING_REF      Supabase project ref of the STAGING project
#   STAGING_DB_URL   postgres connection string for the STAGING database
#
# Verification queries + expected results live in
# docs/security/PHASE-1-STAGING-VALIDATION.md — keep it open while running this.

set -euo pipefail

# --- Hard guard: never allow the production ref/url -----------------------------
PROD_REF="lynkvfduzqdyvlzgriyh"

: "${STAGING_REF:?Set STAGING_REF to your STAGING project ref}"
: "${STAGING_DB_URL:?Set STAGING_DB_URL to your STAGING database URL}"

if [[ "$STAGING_REF" == "$PROD_REF" ]]; then
  echo "REFUSING: STAGING_REF equals the known production ref ($PROD_REF)." >&2
  exit 1
fi
if [[ "$STAGING_DB_URL" == *"$PROD_REF"* ]]; then
  echo "REFUSING: STAGING_DB_URL points at the production project ($PROD_REF)." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIG="$REPO_ROOT/supabase/migrations"

echo "=================================================================="
echo " Phase 1 STAGING rollout"
echo "   project ref : $STAGING_REF   (production ref $PROD_REF is blocked)"
echo "   database    : ${STAGING_DB_URL%%@*}@<redacted>"
echo "=================================================================="
echo "This is STAGING ONLY. It will pause for manual verification at every gate."
read -r -p "Type 'staging' to continue: " ack
[[ "$ack" == "staging" ]] || { echo "Aborted."; exit 1; }

gate() {
  # gate <stage-name>
  echo
  echo ">>> Run the '$1' verification queries from PHASE-1-STAGING-VALIDATION.md now."
  read -r -p ">>> Did '$1' PASS its pass/fail criteria? Type 'pass' to continue, anything else aborts: " ok
  if [[ "$ok" != "pass" ]]; then
    echo "STOP: '$1' not confirmed passing. Halting (no further stages applied)."
    echo "      Roll back per the runbook if needed."
    exit 2
  fi
}

apply_sql() {
  echo "--- psql -f $(basename "$1")"
  psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f "$1"
}

deploy_fns() {
  echo "--- supabase functions deploy $* --project-ref $STAGING_REF"
  supabase functions deploy "$@" --project-ref "$STAGING_REF"
}

# --- Stage 1: backfill + signup trigger ----------------------------------------
apply_sql "$MIG/20260628100000_phase1_backfill_user_profiles_and_signup_trigger.sql"
gate "Stage 1 (backfill + trigger)"

# --- Stage 2: deny-by-default RLS helpers --------------------------------------
apply_sql "$MIG/20260628100100_phase1_deny_by_default_rls_helpers.sql"
gate "Stage 2 (deny-by-default RLS)"

# --- Stage 3: edge-function authz (deploy) -------------------------------------
deploy_fns assign-driver get-org-users gcs-upload user-lifecycle
gate "Stage 3 (edge-function authz)"

# --- Stage 4: storage IDOR path->org (deploy) ----------------------------------
deploy_fns gcs-proxy resolve-signature-url
gate "Stage 4 (storage IDOR functions)"

# --- Stage 5: storage + residual RLS hardening ---------------------------------
apply_sql "$MIG/20260628100200_phase1_storage_and_residual_rls_hardening.sql"
gate "Stage 5 (expense-receipts / sheet-sync / app_settings)"

# --- Stage 5b: close vehicle-signatures storage-API IDOR -----------------------
apply_sql "$MIG/20260628100300_phase1_close_signature_storage_idor.sql"
gate "Stage 5b (vehicle-signatures policies; test signature capture + re-capture)"

echo
echo "All staging stages applied and gated PASS. Run the production go/no-go"
echo "checklist in PHASE-1-STAGING-VALIDATION.md before scheduling production."
echo "Stage 7 (anon-key rotation) is production-only and NOT part of this script."
