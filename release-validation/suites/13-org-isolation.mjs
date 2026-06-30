import { join } from "node:path";
import { pass, fail, notExecuted } from "../lib/types.mjs";
import { run, which } from "../lib/exec.mjs";
import { liveEnv, missingLiveReason } from "../lib/env.mjs";

// Suite 13 — Cross-tenant isolation runtime proof (LIVE).
// Executes sql/org-isolation.sql against the staging DB and parses
// <check>|<PASS|FAIL>|<detail> tuples. Needs a seeded staging clone (real
// orgs/drivers/jobs). Driver identity is auto-selected unless STAGING_DRIVER_SUB
// / STAGING_ORG_A are provided. Gated to NOT_EXECUTED without a live DB/psql.
export default {
  id: "13",
  name: "Cross-tenant isolation — runtime proof (live DB)",
  critical: true,
  requiresLiveEnv: true,
  async run({ root }) {
    const env = liveEnv();
    const reason = missingLiveReason({ db: true });
    if (reason) return { checks: [notExecuted("Org isolation checks", reason)], note: reason };
    if (!which("psql"))
      return {
        checks: [notExecuted("Org isolation checks", "psql not installed in this environment")],
        note: "psql unavailable",
      };

    const sqlFile = join(root, "release-validation", "sql", "org-isolation.sql");
    const args = [
      env.dbUrl,
      "-At",
      "-F|",
      "-v",
      `driver_sub=${process.env.STAGING_DRIVER_SUB || ""}`,
      "-v",
      `org_a=${process.env.STAGING_ORG_A || ""}`,
      "-f",
      sqlFile,
    ];
    const r = run("psql", args, { timeoutMs: 120_000 });
    if (!r.ok)
      return { checks: [fail("psql execution", (r.stderr || r.error || "").slice(0, 800))] };

    const checks = [];
    for (const line of r.stdout.split("\n")) {
      const [name, result, detail] = line.split("|");
      if (!name || !result) continue;
      checks.push(
        result.trim() === "PASS"
          ? pass(name.trim(), detail?.trim() || "PASS")
          : fail(name.trim(), `${result.trim()} ${detail?.trim() || ""}`),
      );
    }
    if (!checks.length)
      checks.push(
        notExecuted(
          "Org isolation checks",
          "no rows — staging DB likely has no seeded driver/org data",
        ),
      );
    return { checks };
  },
};
