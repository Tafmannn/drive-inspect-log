import { join } from "node:path";
import { pass, fail, notExecuted } from "../lib/types.mjs";
import { run } from "../lib/exec.mjs";
import { liveEnv, missingLiveReason } from "../lib/env.mjs";
import { which } from "../lib/exec.mjs";

// Suite 12 — RLS helper runtime proof (LIVE).
// Executes sql/rls-helpers-no-jwt-meta.sql against the staging DB and parses
// the pipe-separated <check>|<PASS|FAIL> tuples. Self-contained: needs no
// seeded identities. Gated to NOT_EXECUTED without STAGING_DB_URL or psql.
export default {
  id: "12",
  name: "RLS helpers — runtime proof (live DB)",
  critical: true,
  requiresLiveEnv: true,
  async run({ root }) {
    const env = liveEnv();
    const reason = missingLiveReason({ db: true });
    if (reason) return { checks: [notExecuted("RLS runtime checks", reason)], note: reason };
    if (!which("psql"))
      return {
        checks: [notExecuted("RLS runtime checks", "psql not installed in this environment")],
        note: "psql unavailable",
      };

    const sqlFile = join(root, "release-validation", "sql", "rls-helpers-no-jwt-meta.sql");
    const r = run("psql", [env.dbUrl, "-At", "-F|", "-v", "ON_ERROR_STOP=1", "-f", sqlFile], {
      timeoutMs: 120_000,
    });
    if (!r.ok)
      return { checks: [fail("psql execution", (r.stderr || r.error || "").slice(0, 800))] };

    const checks = [];
    for (const line of r.stdout.split("\n")) {
      const [name, result] = line.split("|");
      if (!name || !result) continue;
      checks.push(result.trim() === "PASS" ? pass(name.trim(), "PASS") : fail(name.trim(), result.trim()));
    }
    if (!checks.length) checks.push(fail("RLS runtime checks", "no parseable rows from psql"));
    return { checks };
  },
};
