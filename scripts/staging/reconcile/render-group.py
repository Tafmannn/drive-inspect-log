#!/usr/bin/env python3
"""Render ONE guarded, atomic statement that applies several migration files to
STAGING, each fetched from an immutable Git commit and sha256-verified in the
database before EXECUTE. Same guards as apply-from-git.sql, in a loop:
target marker, no re-apply (ledger), HTTP 200, sha256. The whole group is one
statement, so any failure rolls back every file in the group.

Usage: render-group.py <commit> <repo-path.sql> [...]
"""
import hashlib, os, re, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__))
commit = sys.argv[1]
assert re.fullmatch(r"[0-9a-f]{40}", commit)
rows = []
for i, path in enumerate(sys.argv[2:], 1):
    assert re.fullmatch(r"supabase/(migrations|staging-reconcile)/\d{14}_[a-z0-9_]+\.sql", path), path
    blob = subprocess.run(["git", "-C", here, "show", commit + ":" + path], capture_output=True, check=True).stdout
    base = os.path.basename(path)[:-4]
    rows.append("(%d,'%s','%s','%s','%s')" % (i, path, hashlib.sha256(blob).hexdigest(), base[:14], base[15:]))
print("""DO $apply$
DECLARE c text := '@@COMMIT@@'; r record; v_resp extensions.http_response;
BEGIN
  IF coalesce(shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database'), '') <> 'axentra-staging:mfedxybzajdgavzmajkl' THEN
    RAISE EXCEPTION 'TARGET GUARD: database is not marked as Axentra staging';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    @@ROWS@@
  ) v(o, p, s, ver, nm) ORDER BY o LOOP
    IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = r.ver) THEN
      RAISE EXCEPTION 'LEDGER GUARD: % already recorded', r.ver;
    END IF;
    v_resp := extensions.http_get('https://raw.githubusercontent.com/Tafmannn/drive-inspect-log/' || c || '/' || r.p);
    IF v_resp.status <> 200 THEN RAISE EXCEPTION 'FETCH GUARD: HTTP % for %', v_resp.status, r.p; END IF;
    IF encode(extensions.digest(convert_to(v_resp.content, 'UTF8'), 'sha256'), 'hex') <> r.s THEN
      RAISE EXCEPTION 'INTEGRITY GUARD: sha256 mismatch for %', r.p;
    END IF;
    PERFORM set_config('check_function_bodies', 'on', true);
    EXECUTE regexp_replace(v_resp.content, '^[ \\t]*(BEGIN|COMMIT)[ \\t]*;[ \\t]*$', '', 'gni');
    INSERT INTO supabase_migrations.schema_migrations (version, name, created_by)
    VALUES (r.ver, r.nm, 'staging-reconcile git:' || c || ' sha256:' || r.s);
  END LOOP;
END
$apply$;""".replace("@@COMMIT@@", commit).replace("@@ROWS@@", ",\n    ".join(rows)))
