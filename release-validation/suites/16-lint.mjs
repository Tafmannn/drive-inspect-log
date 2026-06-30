import { pass, warn, fail, notExecuted } from "../lib/types.mjs";
import { run, tail } from "../lib/exec.mjs";

// Suite 16 — ESLint (STATIC, executed).
//
// Wires `npm run lint` into the release gate and CI so lint status is visible
// on every run and in the PR job summary.
//
// RATCHET: this suite is intentionally NON-CRITICAL today. The repository
// currently carries a large backlog of `@typescript-eslint/no-explicit-any`
// errors; converting them is a wide, behaviour-risk refactor that is out of
// scope for the release gate. So a lint backlog reports WARNING (visible, not
// blocking) and a clean run reports PASS.
//
// Promote to a hard gate by flipping `critical: true` and changing the
// errors>0 branch from `warn(...)` to `fail(...)` once the error count reaches 0.
export default {
  id: "16",
  name: "ESLint (lint backlog ratchet)",
  critical: false,
  requiresLiveEnv: false,
  async run({ root, fast }) {
    if (fast) {
      return {
        checks: [
          notExecuted("eslint", "skipped in --fast mode — run full `npm run release:validate`"),
        ],
        note: "fast mode",
      };
    }

    const r = run("npm", ["run", "--silent", "lint"], { cwd: root, timeoutMs: 300_000 });
    const out = r.stdout + "\n" + r.stderr;

    // ESLint stylish summary: "✖ 311 problems (289 errors, 22 warnings)"
    const m = out.match(/(\d+)\s+problems?\s*\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/i);
    const errors = m ? Number(m[2]) : r.ok ? 0 : null;
    const warnings = m ? Number(m[3]) : 0;

    if (errors === null) {
      // Could not parse and eslint did not exit clean → surface the tail.
      return { checks: [fail("eslint", tail(out, 20))] };
    }
    if (errors === 0) {
      return {
        checks: [
          pass("eslint", warnings ? `0 errors, ${warnings} warnings` : "clean"),
        ],
      };
    }
    return {
      checks: [
        warn(
          "eslint",
          `${errors} errors, ${warnings} warnings — lint backlog (non-blocking ratchet). ` +
            `Promote suite 16 to critical once errors reach 0.`,
        ),
      ],
      note: "lint backlog tracked, not blocking",
    };
  },
};
