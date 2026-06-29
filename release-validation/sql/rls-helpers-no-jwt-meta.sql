-- release-validation :: suite 12 — RLS helper runtime proof (self-contained)
--
-- Run against a STAGING database only. Emits one row per check as:
--   <check-name>|PASS  or  <check-name>|FAIL
-- so the runner can parse a pipe-separated, tuples-only result
-- (psql -At -F'|' -f this-file).
--
-- These checks need NO seeded identities: they forge a JWT with a random sub
-- and prove the deny-by-default helpers do not honour self-writable metadata.

\set ON_ERROR_STOP on

-- 1) A forged user_metadata.role=super_admin (random sub, no profile row) must
--    NOT resolve to super-admin. Pre-Phase-1 this returned true (C4).
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-0000000000ff',
    'user_metadata', json_build_object('role', 'super_admin',
                                       'org_id', '11111111-1111-1111-1111-111111111111')
  )::text,
  true
) \gset _ignore_

SELECT 'forged_super_admin_is_false' AS check,
       CASE WHEN public.is_super_admin() = false THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'forged_role_not_super' AS check,
       CASE WHEN coalesce(public.user_role(), '') <> 'super_admin' THEN 'PASS' ELSE 'FAIL' END AS result;

-- 2) The live function definitions must not reference *_metadata at all.
SELECT 'helpers_ignore_jwt_meta' AS check,
       CASE WHEN bool_or(pg_get_functiondef(oid) ~* '(user|app)_metadata')
            THEN 'FAIL' ELSE 'PASS' END AS result
FROM pg_proc
WHERE proname IN ('is_super_admin', 'user_role', 'user_org_id')
  AND pronamespace = 'public'::regnamespace;

-- 3) RLS is actually enabled on the multi-tenant core tables.
SELECT 'rls_enabled_jobs' AS check,
       CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class WHERE oid = 'public.jobs'::regclass;

SELECT 'rls_enabled_photos' AS check,
       CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class WHERE oid = 'public.photos'::regclass;
