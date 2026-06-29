import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pass, fail, warn } from "../lib/types.mjs";
import { run } from "../lib/exec.mjs";

// Suite 10 — Committed-secret scan (STATIC, executed).
// Walks git-tracked text files for high-confidence secret material: private
// keys, service-account JSON private_key blocks, and service-role/JWT key
// assignments. The framework's own directory is excluded so its pattern
// strings don't self-match.
const PATTERNS = [
  // Require an actual base64 key body after the header, so PEM-stripping code
  // like `.replace(/-----BEGIN PRIVATE KEY-----/g, "")` does not false-positive.
  { name: "PEM private key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]{100,}-----END/ },
  { name: "GCP service-account private_key", re: /"private_key"\s*:\s*"-----BEGIN/ },
  { name: "Supabase service-role key assignment", re: /(service[_-]?role[_-]?key|SERVICE_ROLE_KEY)\s*[:=]\s*["']?eyJ[A-Za-z0-9_-]{20,}/i },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
];

const SKIP_DIRS = ["release-validation/", "node_modules/", "dist/"];
const SKIP_FILES = [".env.example", "bun.lockb", "bun.lock", "package-lock.json"];

export default {
  id: "10",
  name: "Committed-secret scan",
  critical: true,
  requiresLiveEnv: false,
  async run({ root }) {
    const checks = [];
    const ls = run("git", ["ls-files"], { cwd: root, timeoutMs: 30_000 });
    if (!ls.ok) {
      checks.push(warn("git ls-files", "could not enumerate tracked files"));
      return { checks };
    }
    const files = ls.stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => !SKIP_DIRS.some((d) => f.startsWith(d)))
      .filter((f) => !SKIP_FILES.includes(f.split("/").pop()));

    const findings = [];
    let scanned = 0;
    for (const f of files) {
      const full = join(root, f);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.size > 2 * 1024 * 1024) continue; // skip very large/binary blobs
      let text;
      try {
        text = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      if (/\u0000/.test(text)) continue; // NUL byte -> binary, skip
      scanned++;
      for (const p of PATTERNS)
        if (p.re.test(text)) findings.push(`${f}: ${p.name}`);
    }

    checks.push(
      findings.length === 0
        ? pass("No committed secrets", `${scanned} tracked text files scanned`)
        : fail("No committed secrets", findings.slice(0, 20).join("\n")),
    );

    // .env must not be tracked (defence in depth alongside suite 01).
    const tracked = run("git", ["ls-files", ".env"], { cwd: root, timeoutMs: 10_000 });
    checks.push(
      tracked.stdout.trim()
        ? fail(".env not committed", ".env is tracked by git")
        : pass(".env not committed", "untracked"),
    );

    return { checks };
  },
};
