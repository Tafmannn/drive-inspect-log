#!/usr/bin/env python3
"""Extract a payload column from a saved Supabase MCP execute_sql result and
verify it against the server-side md5 column before writing it.

Usage: python3 -I extract-mcp-result.py [--ref=<project-ref>] <mcp-result.txt> <payload-col> <out-file> [meta-out.json]

--ref defaults to the staging ref. --ref=<production ref> is accepted ONLY for
catalogue payloads (ddl, fp, ledger): production row data is always refused.

Fails closed (exit 2) if: the result is malformed, expected_ref is not the
staging ref, md5/length do not match, or the output path is inside a Git
checkout. Writes with mode 0600. Never prints payload content.
"""
import hashlib, json, os, re, subprocess, sys

STAGING = "mfedxybzajdgavzmajkl"
PROD = "lynkvfduzqdyvlzgriyh"

def die(msg):
    print("BLOCKED: " + msg, file=sys.stderr)
    sys.exit(2)

args = [a for a in sys.argv[1:] if not a.startswith("--ref=")]
ref = next((a[6:] for a in sys.argv[1:] if a.startswith("--ref=")), STAGING)
if ref not in (STAGING, PROD):
    die("unknown project ref")
sys.argv = [sys.argv[0]] + args
if len(sys.argv) not in (4, 5):
    die("usage: extract-mcp-result.py <mcp-result.txt> <payload-col> <out-file> [meta-out.json]")
src, col, out = sys.argv[1], sys.argv[2], os.path.abspath(sys.argv[3])
if ref == PROD and col not in ("ddl", "fp", "ledger"):
    die("production exports are limited to catalogue payloads; no production row data")
meta_out = os.path.abspath(sys.argv[4]) if len(sys.argv) == 5 else None

for p in [out] + ([meta_out] if meta_out else []):
    d = os.path.dirname(p)
    r = subprocess.run(["git", "-C", d, "rev-parse", "--is-inside-work-tree"], capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip() == "true":
        die("refusing to write backup material inside a Git checkout: " + d)

raw = open(src, encoding="utf-8", newline="").read()
try:
    o = json.loads(raw)
    text = o["result"] if isinstance(o, dict) else o[0]["text"]
    if text.lstrip().startswith("{"):
        text = json.loads(text)["result"]
except Exception:
    die("unrecognised MCP result envelope")
m = re.search(r"<untrusted-data-[0-9a-f-]+>\n(.*)\n</untrusted-data-[0-9a-f-]+>", text, re.S)
if not m:
    die("no data block in result")
rows = json.loads(m.group(1))
if len(rows) != 1:
    die("expected exactly one row")
row = rows[0]
if row.get("expected_ref") != ref:
    die("result is not tagged with the expected project ref")
payload = row.get(col)
if not isinstance(payload, str):
    die("payload column missing")
if ref == STAGING and PROD in payload:
    die("production project ref appears inside payload; investigate before use")
h = hashlib.md5(payload.encode("utf-8")).hexdigest()
if h != row.get("md5") or len(payload) != row.get("len"):
    die("md5/length mismatch: local %s/%d vs server %s/%s" % (h, len(payload), row.get("md5"), row.get("len")))

old = os.umask(0o077)
with open(out, "w", encoding="utf-8", newline="") as f:
    f.write(payload)
if meta_out:
    meta = {k: v for k, v in row.items() if k not in (col, "spill_pad")}
    with open(meta_out, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1, sort_keys=True)
os.umask(old)
print("VERIFIED md5=%s len=%d -> %s" % (h, len(payload), out))
