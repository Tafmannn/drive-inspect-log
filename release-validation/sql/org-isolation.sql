-- Suite 13: staging-only, read-only RLS proof under an actual driver claim.
-- Select a non-vacuous fixture before assuming the authenticated role.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
WITH candidate AS (
 SELECT u.auth_user_id,u.org_id
 FROM public.user_profiles u
 WHERE u.role='driver' AND u.account_status='active' AND u.org_id IS NOT NULL
   AND (:'driver_sub'='' OR u.auth_user_id::text=:'driver_sub')
   AND (:'org_a'='' OR u.org_id::text=:'org_a')
   AND EXISTS (
      SELECT 1 FROM public.driver_profiles d JOIN public.jobs j ON j.driver_id=d.id
      WHERE d.user_id=u.auth_user_id AND d.org_id=u.org_id
        AND j.org_id=u.org_id AND j.is_test=false
   )
   AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.org_id<>u.org_id AND j.is_test=false)
 ORDER BY u.auth_user_id LIMIT 1
)
SELECT EXISTS(SELECT 1 FROM candidate) AS fixture_ok,
 coalesce((SELECT auth_user_id::text FROM candidate),'') AS fixture_sub,
 coalesce((SELECT org_id::text FROM candidate),'') AS fixture_org
\gset
\if :fixture_ok
-- Capture foreign object paths with the baseline role. Never rely on the
-- driver's filtered expenses query to enumerate records belonging to org B.
SELECT coalesce(json_agg(o.name ORDER BY o.name),'[]'::json)::text AS foreign_receipt_names
FROM storage.objects o JOIN public.expenses e ON split_part(o.name,'/',1)=e.id::text
WHERE o.bucket_id='expense-receipts' AND e.org_id::text<>:'fixture_org'
\gset
SELECT set_config('request.jwt.claims',json_build_object('sub',:'fixture_sub','role','authenticated')::text,true) \gset _ignore_
SET LOCAL ROLE authenticated;
SELECT 'driver_rls_context' AS check,
 CASE WHEN current_user='authenticated' AND auth.uid()::text=:'fixture_sub'
   AND public.user_org_id()::text=:'fixture_org' AND public.user_role()::text='driver'
   AND row_security_active('public.jobs'::regclass) THEN 'PASS' ELSE 'FAIL' END AS result,
 'role, subject, organisation and RLS context' AS detail;
SELECT 'driver_sees_only_own_org' AS check,
 CASE WHEN count(*) FILTER (WHERE org_id::text=:'fixture_org')>0
   AND count(*) FILTER (WHERE org_id::text IS DISTINCT FROM :'fixture_org')=0
 THEN 'PASS' ELSE 'FAIL' END AS result,
 count(*)||' visible jobs, '||count(*) FILTER (WHERE org_id::text IS DISTINCT FROM :'fixture_org')||' cross-org' AS detail
FROM public.jobs;
SELECT 'driver_no_cross_org_receipts' AS check,
 CASE WHEN json_array_length(:'foreign_receipt_names'::json)=0 THEN 'NOT_EXECUTED'
 WHEN count(*)=0 AND row_security_active('storage.objects'::regclass) THEN 'PASS' ELSE 'FAIL' END AS result,
 CASE WHEN json_array_length(:'foreign_receipt_names'::json)=0 THEN 'No foreign receipt fixtures exist'
 ELSE count(*)||' foreign receipt objects visible' END AS detail
FROM storage.objects o
WHERE o.bucket_id='expense-receipts' AND o.name IN (SELECT json_array_elements_text(:'foreign_receipt_names'::json));
RESET ROLE;
\else
SELECT 'driver_rls_context','NOT_EXECUTED','No active assigned driver and foreign visible job fixtures matching requested scope';
SELECT 'driver_sees_only_own_org','NOT_EXECUTED','Required positive and negative fixtures absent';
SELECT 'driver_no_cross_org_receipts','NOT_EXECUTED','Required driver fixture absent';
\endif
ROLLBACK;
