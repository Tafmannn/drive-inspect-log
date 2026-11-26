#!/usr/bin/env python3
"""Extract complete object definitions from a catalogue export produced by
scripts/staging/logical-backup/export-schema.sql (blocks headed "-- [NN] key").

  extract-objects.py <schema.sql> [--table public.T]... [--function public.name]... [--section NN:regex]...

Table: CREATE TABLE + defaults + PK/unique/check + FKs + indexes + triggers +
RLS flags + policies + owner + table/column grants.
Function: every overload of the name + owner + ACL (REVOKE PUBLIC then grants).
Output is ordered by section number, so dependencies resolve the same way
as a full restore. Prints SQL to stdout; never connects to a database.
"""
import re, sys

def blocks(path):
    text = open(path, encoding="utf-8", newline="").read()
    parts = re.split(r"(?m)^-- \[(\d\d)\] (.*)\n", text)
    out = []
    for i in range(1, len(parts), 3):
        out.append((int(parts[i]), parts[i + 1], parts[i + 2].rstrip("\n")))
    return out

def table_match(sec, key, stmt, t):
    s, r = t.split(".")
    q = re.escape(s) + r"\." + re.escape(r)
    pats = {
        6: r"^CREATE TABLE " + q + r" \(",
        9: r"^ALTER TABLE ONLY " + q + r" ALTER COLUMN ",
        10: r"^ALTER TABLE ONLY " + q + r" ADD CONSTRAINT ",
        11: r"^ALTER TABLE ONLY " + q + r" ADD CONSTRAINT ",
        12: r"^CREATE (UNIQUE )?INDEX \S+ ON (ONLY )?" + q + r" USING ",
        13: r"^CREATE (CONSTRAINT )?TRIGGER .* ON " + q + r" ",
        14: r"^ALTER TABLE " + q + r" (ENABLE|FORCE) ROW LEVEL SECURITY",
        15: r"^CREATE POLICY \S+ ON " + q + r" AS ",
        16: r"^ALTER TABLE " + q + r" OWNER TO ",
        17: r"^(REVOKE ALL|GRANT [A-Z, ()a-z_]+) ON TABLE " + q + r" ",
    }
    p = pats.get(sec)
    return bool(p and re.search(p, stmt, re.S))

def func_match(sec, key, stmt, f):
    s, n = f.split(".")
    if sec == 7:
        return key.startswith(f + "(")
    if sec == 16:
        return key.startswith("f" + f + "(")
    if sec == 17:
        return key.startswith("d" + f + "(") or key.startswith("e" + f + "(")
    return False

def main():
    args = sys.argv[1:]
    path = args.pop(0)
    tables, funcs, secs = [], [], []
    while args:
        flag, val = args.pop(0), args.pop(0)
        {"--table": tables, "--function": funcs, "--section": secs}[flag].append(val)
    chosen = []
    for b in blocks(path):
        sec, key, stmt = b
        if any(table_match(sec, key, stmt, t) for t in tables) or any(func_match(sec, key, stmt, f) for f in funcs) \
           or any(sec == int(x.split(":", 1)[0]) and re.search(x.split(":", 1)[1], key) for x in secs):
            chosen.append(b)
    chosen.sort(key=lambda b: b[0])
    for sec, key, stmt in chosen:
        print("-- [%02d] %s\n%s" % (sec, key, stmt))
    sys.stderr.write("extracted %d blocks\n" % len(chosen))

if __name__ == "__main__":
    main()
