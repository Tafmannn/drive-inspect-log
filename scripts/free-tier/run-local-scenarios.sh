#!/usr/bin/env bash
set -euo pipefail
if [[ "$AXENTRA_DISPOSABLE_DB" != YES || "$PGHOST" != 127.0.0.1 || "$PGPORT" != 54322 ]]; then
  echo "REFUSED: tests require disposable local Supabase only" >&2
  exit 2
fi
export PGUSER=postgres PGDATABASE=postgres PGPASSWORD=postgres PGSSLMODE=disable
echo "Invoice lifecycle SQL scenario"
# invoice_lifecycle.test.sql commits its fixtures by design; wrap it so it never
# leaks rows into the scenarios that follow (or into a reused local database).
{ echo "BEGIN;"; cat supabase/tests/invoice_lifecycle.test.sql; echo; echo "ROLLBACK;"; } | psql -X -v ON_ERROR_STOP=1
echo "Job Workspace tenant acknowledgement SQL scenario (rollback)"
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/job_workspace_attention_scope.sql
echo "Job Workspace deferred correction SQL scenario (rollback)"
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/job_workspace_deferred_correction.sql
echo "Abort fees and authorization SQL scenario (rollback)"
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/job_abort_workflow.sql
if ls supabase/migrations/*_digital_id_v2.sql >/dev/null 2>&1; then
  if [[ ! -f supabase/tests/digital_id_v2.integration.sql ]]; then
    echo "BLOCKED: Digital ID SQL integration tests missing" >&2
    exit 3
  fi
  echo "Digital ID issuance, revocation and permissions SQL (rollback)"
  psql -X -v ON_ERROR_STOP=1 -f supabase/tests/digital_id_v2.integration.sql
else
  echo "NOT_APPLICABLE: Digital ID migration not in this branch"
fi
