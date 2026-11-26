#!/usr/bin/env python3
"""Remove whole-line `--` comments that sit OUTSIDE dollar-quoted bodies and
string literals. Comments inside function/DO bodies are kept (they are part of
stored definitions and fingerprints). Used only to shrink transport payloads;
the rehearsal applies the stripped files and must still match production.

Usage: strip-toplevel-comments.py <in.sql> <out.sql>
"""
import re, sys

src = open(sys.argv[1], encoding="utf-8", newline="").read()
out, i, n = [], 0, len(src)
dollar = None          # active $tag$ or None
in_str = False         # inside '...'
line_start = True
while i < n:
    c = src[i]
    if dollar:
        if src.startswith(dollar, i):
            out.append(dollar); i += len(dollar); dollar = None; continue
        out.append(c); i += 1; line_start = (c == "\n"); continue
    if in_str:
        out.append(c); i += 1
        if c == "'":
            if i < n and src[i] == "'":
                out.append("'"); i += 1
            else:
                in_str = False
        line_start = (c == "\n"); continue
    if line_start:
        m = re.match(r"[ \t]*--[^\n]*\n", src[i:])
        if m:
            i += m.end(); continue
    if c == "'":
        in_str = True; out.append(c); i += 1; line_start = False; continue
    if c == "$":
        m = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", src[i:])
        if m:
            dollar = m.group(0); out.append(dollar); i += len(dollar); line_start = False; continue
    out.append(c); i += 1; line_start = (c == "\n")
open(sys.argv[2], "w", encoding="utf-8", newline="").write("".join(out))
