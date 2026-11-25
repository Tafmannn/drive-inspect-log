-- Staging-only runtime proof. Transaction-local role and JWT claims must
-- remain active during every assertion; no customer or fixture data is changed.
\set ON_ERROR_STOP on
\if :{?driver_sub}
\else
\set driver_sub ''
\endif
\if :{?org_a}
\else
\set org_a ''
\endif
BEGIN;
CREATE TEMP TABLE _vd AS
SELECT auth_user_id,org_id
FROM public.user_profiles
WHERE role='driver' AND account_status='active' AND org_id IS NOT NULL
  AND (:'driver_sub'='' OR auth_user_id::text=:'driver_sub')
  AND (:'org_a'='' OR org_id::text=:'org_a')
ORDER BY auth_user_id LIMIT 1;
CREATE TEMP TABLE _foreign_jobs AS
SELECT id FROM public.jobs WHERE org_id IS DISTINCT FROM (SELECT org_id FROM _vd);
-- Compute foreign object paths before impersonation; under RLS the driver
-- cannot enumerate foreign expenses, so an in-role subquery is vacuous.
CREATE TEMP TABLE _foreign_expenses AS
SELECT id::text AS id FROM public.expenses WHERE org_id IS DISTINCT FROM (SELECT org_id FROM _vd);
GRANT SELECT ON _vd,_foreign_jobs,_foreign_expenses TO authenticated;
SELECT set_config('request.jwt.claim.sub',COALESCE((SELECT auth_user_id::text FROM _vd),''),true) \gset _ignore_sub_
SELECT set_config('request.jwt.claims',json_build_object('sub',(SELECT auth_user_id FROM _vd),'role','authenticated')::text,true) \gset _ignore_
SET LOCAL ROLE authenticated;
SELECT 'driver_identity_verified' AS check,
 CASE WHEN current_user='authenticated' AND auth.uid()=(SELECT auth_user_id FROM _vd)
   AND public.user_org_id()=(SELECT org_id FROM _vd) THEN 'PASS' ELSE 'FAIL' END AS result,
 'authenticated driver and expected organisation' AS detail;
SELECT 'driver_sees_only_own_org' AS check,
 CASE WHEN (SELECT count(*) FROM _vd)=1 AND (SELECT count(*) FROM _foreign_jobs)>0
   AND count(*)>0 AND count(*) FILTER (WHERE org_id IS DISTINCT FROM (SELECT org_id FROM _vd))=0
 THEN 'PASS' ELSE 'FAIL' END AS result,
 count(*) || ' visible jobs, ' || count(*) FILTER (WHERE org_id IS DISTINCT FROM (SELECT org_id FROM _vd)) || ' cross-org' AS detail
FROM public.jobs;
SELECT 'driver_no_cross_org_receipts' AS check,
 CASE WHEN (SELECT count(*) FROM _vd)=1 AND count(*)=0 THEN 'PASS' ELSE 'FAIL' END AS result,
 count(*) || ' foreign receipt objects visible; ' || (SELECT count(*) FROM _foreign_expenses) || ' foreign expense fixture paths' AS detail
FROM storage.objects o WHERE o.bucket_id='expense-receipts'
 AND split_part(o.name,'/',1) IN (SELECT id FROM _foreign_expenses);
RESET ROLE;
ROLLBACK;
