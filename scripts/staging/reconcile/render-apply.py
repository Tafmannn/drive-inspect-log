#!/usr/bin/env python3
"""Render apply-from-git.sql for one or more files at a Git commit.
Usage: render-apply.py <commit> <repo-path.sql> [<repo-path.sql> ...]
sha256 is computed from `git show <commit>:<path>` (the exact blob GitHub serves)."""
import hashlib, os, re, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
tpl = open(os.path.join(here, "apply-from-git.sql")).read()
commit = sys.argv[1]
assert re.fullmatch(r"[0-9a-f]{40}", commit), "commit must be a full sha"
for path in sys.argv[2:]:
    assert re.fullmatch(r"supabase/(migrations|staging-reconcile)/\d{14}_[a-z0-9_]+\.sql", path), path
    blob = subprocess.run(["git", "-C", here, "show", commit + ":" + path], capture_output=True, check=True).stdout
    base = os.path.basename(path)[:-4]
    vals = {"commit": commit, "path": path, "sha256": hashlib.sha256(blob).hexdigest(), "version": base[:14], "name": base[15:]}
    out = tpl
    for k, v in vals.items():
        out = out.replace("{{%s}}" % k, v)
    assert "{{" not in out
    sys.stdout.write(out + "\n")
