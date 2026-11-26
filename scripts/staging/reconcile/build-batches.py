#!/usr/bin/env python3
"""Build guarded, atomic staging apply batches from repository migration files.

For each migration (in the order given) emits <outdir>/<version>.sql:

  BEGIN;
  <target guard: database comment must be the staging marker>
  <idempotency guard: version must not already be in the ledger>
  <exact migration file content>
  INSERT INTO supabase_migrations.schema_migrations(version, name, statements, created_by)
  COMMIT;

Why not `supabase db push` / MCP apply_migration: both stamp the APPLY time as the
ledger version (the root cause of today's divergence). This keeps the original
repository version, so ledger == repository from now on.

The only content transform: a migration's own top-level `BEGIN;`/`COMMIT;` lines
are removed so the file and its ledger row commit atomically (listed in the
manifest). Everything else is byte-identical; sha256 of the source file is
recorded in the ledger `created_by` field for audit (statements are not
duplicated into the ledger; the file in Git at that sha256 is the record).

Usage: build-batches.py <outdir> <file.sql> [<file.sql> ...]
"""
import hashlib, os, re, sys

MARKER = "axentra-staging:mfedxybzajdgavzmajkl"
GUARD = """DO $guard$ BEGIN
  IF coalesce(shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database'), '') <> '%s' THEN
    RAISE EXCEPTION 'TARGET GUARD: this database is not marked as Axentra staging; refusing to apply';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '%s' OR name LIKE '%s\\_%%') THEN
    RAISE EXCEPTION 'LEDGER GUARD: migration %s already recorded; refusing to re-apply';
  END IF;
END $guard$;
"""

def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    manifest = []
    for path in sys.argv[2:]:
        base = os.path.basename(path)[:-4]
        version, name = base[:14], base[15:]
        assert re.fullmatch(r"\d{14}", version) and name, base
        raw = open(path, "rb").read()
        sha = hashlib.sha256(raw).hexdigest()
        text = raw.decode("utf-8")
        lines = text.split("\n")
        stripped = [i for i, l in enumerate(lines) if re.fullmatch(r"\s*(BEGIN|COMMIT)\s*;\s*", l, re.I)]
        body = "\n".join(l for i, l in enumerate(lines) if i not in stripped)
        tag = "mig_" + version
        assert "$" + tag + "$" not in body
        sql = ("BEGIN;\n" + GUARD % (MARKER, version, version, version) +
               "-- ==== " + base + " (sha256 " + sha + ") ====\n" + body + "\n;\n" +
               "INSERT INTO supabase_migrations.schema_migrations (version, name, created_by) VALUES ('%s', '%s', 'staging-reconcile sha256:%s');\n" % (version, name, sha) +
               "COMMIT;\n")
        open(os.path.join(out, version + ".sql"), "w", encoding="utf-8", newline="").write(sql)
        manifest.append("%s %s sha256=%s stripped_txn_lines=%s bytes=%d" % (version, name, sha, [i + 1 for i in stripped], len(sql)))
    open(os.path.join(out, "MANIFEST.txt"), "w").write("\n".join(manifest) + "\n")
    print("\n".join(manifest))

if __name__ == "__main__":
    main()
