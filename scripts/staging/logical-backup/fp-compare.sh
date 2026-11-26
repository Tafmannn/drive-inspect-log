#!/usr/bin/env bash
# Fingerprint a LOCAL rehearsal database and diff it against a saved
# fingerprint JSON (from fingerprint.sql run on staging or production).
# Usage: fp-compare.sh <expected-fp.json> <port> <rehearsal_db> [--details]
# Prints missing / extra / different groups; exit 1 when anything differs.
set -euo pipefail
EXP=${1:?expected fingerprint json}; PORT=${2:?port}; DB=${3:?db}; DETAILS=${4:-}
case "$DB" in rehearsal_*) ;; *) echo "BLOCKED: rehearsal_* databases only"; exit 2;; esac
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(mktemp); trap 'rm -f "$OUT"' EXIT
psql -X -Atq -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres -d "$DB" -c "set search_path to pg_catalog" \
  -c "select json_agg(f) from ($(sed -n '/^with$/,$p' "$HERE/fingerprint.sql" | sed 's/;\s*$//')) f" > "$OUT"
python3 -I - "$EXP" "$OUT" "$DETAILS" <<'EOF'
import json, sys
a = {(r["kind"], r["object"]): r for r in json.load(open(sys.argv[1]))}
b = {(r["kind"], r["object"]): r for r in json.load(open(sys.argv[2]))}
missing = sorted(k for k in a if k not in b); extra = sorted(k for k in b if k not in a)
diff = sorted(k for k in a if k in b and (a[k]["hash"], a[k]["entries"]) != (b[k]["hash"], b[k]["entries"]))
print("groups expected=%d actual=%d missing=%d extra=%d different=%d" % (len(a), len(b), len(missing), len(extra), len(diff)))
if sys.argv[3] == "--details":
    for tag, ks in (("MISSING", missing), ("EXTRA", extra), ("DIFFERENT", diff)):
        for k in ks: print(tag, k[0], k[1])
sys.exit(1 if (missing or extra or diff) else 0)
EOF
