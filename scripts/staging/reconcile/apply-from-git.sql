-- Apply ONE migration file to STAGING, fetched from an immutable Git commit.
-- Template rendered by render-apply.py ({{placeholders}}; values are validated
-- there: 40-hex commit, repo-relative .sql path, 64-hex sha256, 14-digit version).
--   {{commit}}  commit sha on GitHub (Tafmannn/drive-inspect-log)
--   {{path}}    repo path of the .sql file
--   {{sha256}}  sha256 of the file as committed (computed locally from Git)
--   {{version}} / {{name}}  ledger version and name
-- Guards (all must pass, else the whole statement rolls back):
--   1. database comment is the staging marker (fail closed on any other DB)
--   2. ledger does not already contain this version (no re-apply)
--   3. HTTP 200 and sha256(content) == expected (no tampering / truncation)
-- A file's own top-level BEGIN;/COMMIT; lines are removed (they cannot run inside
-- a DO block); the transformed text's sha256 is recorded alongside.
-- Requires extension `http` (staging only, temporary) and pgcrypto.
DO $apply$
DECLARE
  v_marker text := 'axentra-staging:mfedxybzajdgavzmajkl';
  v_url    text := 'https://raw.githubusercontent.com/Tafmannn/drive-inspect-log/' || '{{commit}}' || '/' || '{{path}}';
  v_resp   extensions.http_response;
  v_body   text;
BEGIN
  IF coalesce(shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database'), '') <> v_marker THEN
    RAISE EXCEPTION 'TARGET GUARD: database is not marked as Axentra staging';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '{{version}}') THEN
    RAISE EXCEPTION 'LEDGER GUARD: % already recorded', '{{version}}';
  END IF;
  v_resp := extensions.http_get(v_url);
  IF v_resp.status <> 200 THEN
    RAISE EXCEPTION 'FETCH GUARD: HTTP % for %', v_resp.status, v_url;
  END IF;
  IF encode(extensions.digest(convert_to(v_resp.content, 'UTF8'), 'sha256'), 'hex') <> '{{sha256}}' THEN
    RAISE EXCEPTION 'INTEGRITY GUARD: sha256 mismatch for %', '{{path}}';
  END IF;
  v_body := regexp_replace(v_resp.content, '^[ \t]*(BEGIN|COMMIT)[ \t]*;[ \t]*$', '', 'gni');
  EXECUTE v_body;
  INSERT INTO supabase_migrations.schema_migrations (version, name, created_by)
  VALUES ('{{version}}', '{{name}}', 'staging-reconcile git:' || '{{commit}}' || ' sha256:' || '{{sha256}}');
END
$apply$;
