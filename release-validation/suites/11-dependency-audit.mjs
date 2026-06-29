import { pass, fail, warn, notExecuted } from "../lib/types.mjs";
import { run } from "../lib/exec.mjs";

// Suite 11 — Dependency vulnerability audit (advisory, executed when online).
// Runs `npm audit --json`. Critical/high advisories are surfaced as WARN (not a
// hard release blocker — many are dev-only/transitive). If the registry is
// unreachable, the suite is NOT_EXECUTED rather than passed.
export default {
  id: "11",
  name: "Dependency vulnerability audit",
  critical: false,
  requiresLiveEnv: false,
  async run({ root }) {
    const r = run("npm", ["audit", "--json"], { cwd: root, timeoutMs: 180_000 });
    const text = r.stdout || "";
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        checks: [
          notExecuted(
            "npm audit",
            "registry unreachable or non-JSON output (offline CI?) — re-run with network access",
          ),
        ],
        note: "advisory; not executed",
      };
    }

    const v = data.metadata?.vulnerabilities || {};
    const crit = v.critical || 0;
    const high = v.high || 0;
    const mod = v.moderate || 0;
    const low = v.low || 0;
    const summary = `critical=${crit} high=${high} moderate=${mod} low=${low}`;

    const checks = [
      crit + high === 0
        ? pass("No critical/high advisories", summary)
        : warn("Critical/high advisories present", `${summary} — review before release`),
    ];
    if (mod + low > 0) checks.push(pass("Moderate/low advisories (informational)", `moderate=${mod} low=${low}`));
    return { checks };
  },
};
