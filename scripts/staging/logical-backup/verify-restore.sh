#!/usr/bin/env bash
# Verify a rehearsal restore against the staging export manifest:
#  1. catalogue fingerprint (fingerprint.sql) of the restored DB vs the staging
#     fingerprint captured at export time (phase00-catalogue-compare.mjs)
#  2. per-table row count + md5 of sorted row literals vs data.meta.json
#  3. migration ledger, auth users/identities and storage buckets presence
# Loopback only. Usage: verify-restore.sh <workdir> <port> [dbname]
set -euo pipefail
WORK=${1:?workdir}; PORT=${2:?port}; DB=${3:-rehearsal_staging}
HERE=$(cd "$(dirname "$0")" && pwd)
case "$DB" in rehearsal_*) ;; *) echo "BLOCKED: db name must start with rehearsal_"; exit 2;; esac
export PGHOST=127.0.0.1 PGPORT="$PORT" PGUSER=postgres
fail=0
psql -X -Atq -v ON_ERROR_STOP=1 -d "$DB" -c "set search_path to pg_catalog" -c "select json_agg(f) from ($(sed -n '/^with$/,$p' "$HERE/fingerprint.sql" | sed 's/;\s*$//')) f" > "$WORK/restored-fp.json"
python3 -I - "$WORK/staging-fp.json" "$WORK/restored-fp.json" <<'EOF'
import json, sys
a = {(r["kind"], r["object"]): r for r in json.load(open(sys.argv[1]))}
b = {(r["kind"], r["object"]): r for r in json.load(open(sys.argv[2]))}
missing = sorted(k for k in a if k not in b); extra = sorted(k for k in b if k not in a)
diff = sorted(k for k in a if k in b and (a[k]["hash"], a[k]["entries"]) != (b[k]["hash"], b[k]["entries"]))
print("fingerprint groups: staging=%d restored=%d missing=%d extra=%d different=%d" % (len(a), len(b), len(missing), len(extra), len(diff)))
for k in (missing + extra + diff)[:40]: print("  ", k)
sys.exit(1 if (missing or extra or diff) else 0)
EOF
[ $? -eq 0 ] || fail=1
python3 -I - "$WORK/data.meta.json" "$DB" "$PORT" <<'EOF' || fail=1
import json, subprocess, sys
meta = json.load(open(sys.argv[1])); db, port = sys.argv[2], sys.argv[3]
bad = 0
for t, v in meta["tables"].items():
    s, r = t.split(".", 1)
    q = 'select count(*)||\',\'||coalesce(md5(string_agg((t)::text, chr(10) order by (t)::text collate "C")),\'-\') from "%s"."%s" t' % (s, r)
    out = subprocess.run(["psql", "-X", "-Atq", "-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", db, "-c", q], capture_output=True, text=True, check=True).stdout.strip()
    n, h = out.split(",")
    ok = int(n) == v["rows"] and (v["rows"] == 0 or h == v["src_md5"])
    if not ok: bad += 1; print("  DATA MISMATCH", t, n, v["rows"])
print("data tables checked=%d mismatches=%d" % (len(meta["tables"]), bad))
sys.exit(1 if bad else 0)
EOF
psql -X -Atq -d "$DB" -c "select 'ledger='||(select count(*) from supabase_migrations.schema_migrations)||' auth_users='||(select count(*) from auth.users)||' identities='||(select count(*) from auth.identities)||' buckets='||(select count(*) from storage.buckets)||' objects='||(select count(*) from storage.objects)||' jobs='||(select count(*) from public.jobs)||' orgs='||(select count(*) from public.organisations)"
[ $fail -eq 0 ] && echo "VERIFY: PASS" || { echo "VERIFY: FAIL"; exit 1; }
