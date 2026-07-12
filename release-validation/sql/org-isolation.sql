-- release-validation :: suite 13 — cross-tenant isolation runtime proof
--
-- Run against a STAGING database only. Emits pipe-separated tuples:
--   <check-name>|PASS|<detail>  or  <check-name>|FAIL|<detail>
-- (psql -At -F'|' -f this-file).
--
-- Requires a driver identity. Supply it explicitly for a deterministic test:
--   psql ... -v driver_sub="<auth_user_id>" -v org_a="<org-uuid>" -f org-isolation.sql
-- If not supplied, the script auto-selects the first driver with an org.
-- The runner passes -v values when STAGING_DRIVER_SUB / STAGING_ORG_A are set;
-- otherwise it gates the suite as NOT_EXECUTED.

\set ON_ERROR_STOP on

-- Resolve the test driver into a temp table so both statements agree.
-- No ON COMMIT DROP: psql runs in autocommit mode (each statement is its
-- own implicit transaction), so ON COMMIT DROP would drop this table the
-- instant the CREATE statement commits, before any later statement could
-- see it. A plain TEMP TABLE lives for the psql session and is cleaned up
-- automatically when the connection closes at the end of this script.
CREATE TEMP TABLE _vd AS
SELECT auth_user_id, org_id
FROM public.user_profiles
WHERE role = 'driver' AND org_id IS NOT NULL
  AND (:'driver_sub' = '' OR auth_user_id::text = :'driver_sub')
ORDER BY auth_user_id
LIMIT 1;

-- Impersonate that driver as the RLS-bound `authenticated` role.
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', (SELECT auth_user_id FROM _vd), 'role', 'authenticated')::text,
  true
) \gset _ignore_

SET LOCAL ROLE authenticated;

-- Under the driver's claims, no other org's jobs may be visible.
SELECT 'driver_sees_only_own_org' AS check,
       CASE WHEN count(*) FILTER (WHERE org_id <> (SELECT org_id FROM _vd)) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*) || ' visible jobs, '
         || count(*) FILTER (WHERE org_id <> (SELECT org_id FROM _vd)) || ' cross-org' AS detail
FROM public.jobs;

RESET ROLE;

-- Receipts are org-scoped (Phase 1 Stage 5): no cross-org receipt objects visible.
SET LOCAL ROLE authenticated;
SELECT 'driver_no_cross_org_receipts' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*) || ' cross-org receipt objects' AS detail
FROM storage.objects o
WHERE o.bucket_id = 'expense-receipts'
  AND split_part(o.name, '/', 1) IN (
        SELECT id::text FROM public.expenses WHERE org_id <> (SELECT org_id FROM _vd)
      );
RESET ROLE;
