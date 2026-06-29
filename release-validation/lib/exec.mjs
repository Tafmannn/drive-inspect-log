import { spawnSync } from "node:child_process";

// Thin, dependency-free wrapper around spawnSync. Captures stdout/stderr,
// never throws on a non-zero exit (callers inspect .code), and supports a
// timeout so a hung command can't wedge the whole run.
export function run(cmd, args = [], opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 600_000,
    maxBuffer: 64 * 1024 * 1024,
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env || {}) },
    input: opts.input,
  });
  const stdout = res.stdout || "";
  const stderr = res.stderr || "";
  return {
    code: res.status ?? (res.error ? -1 : null),
    signal: res.signal,
    stdout,
    stderr,
    error: res.error ? String(res.error.message || res.error) : null,
    ok: res.status === 0,
  };
}

// Returns true when an executable is resolvable on PATH.
export function which(bin) {
  const r = run(process.platform === "win32" ? "where" : "which", [bin], {
    timeoutMs: 10_000,
  });
  return r.ok && r.stdout.trim().length > 0;
}

// Last N lines of a blob — keeps report detail bounded.
export function tail(text, n = 12) {
  return String(text || "")
    .trim()
    .split("\n")
    .slice(-n)
    .join("\n");
}
