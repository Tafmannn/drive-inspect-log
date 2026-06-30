import { pass, fail, notExecuted } from "../lib/types.mjs";
import { run, tail } from "../lib/exec.mjs";

// Suite 09 — Unit / regression test suite (STATIC, executed).
// Runs `npm test` (vitest run) and parses the summary line. Any failed test
// blocks release. Includes the security-relevant tests (storage path authz,
// 0-byte upload guard, queue serialization).
export default {
  id: "09",
  name: "Unit / regression tests (vitest)",
  critical: true,
  requiresLiveEnv: false,
  async run({ root, fast }) {
    if (fast) {
      return {
        checks: [
          notExecuted("vitest run", "skipped in --fast mode — run full `npm run release:validate` before release"),
        ],
        note: "fast mode",
      };
    }
    const r = run("npm", ["test", "--silent"], { cwd: root, timeoutMs: 480_000 });
    const out = r.stdout + "\n" + r.stderr;

    const passed = (out.match(/Tests\s+.*?(\d+)\s+passed/i) || [])[1];
    const failed = (out.match(/(\d+)\s+failed/i) || [])[1];
    const summary =
      passed != null
        ? `${passed} passed${failed ? `, ${failed} failed` : ""}`
        : tail(out, 8);

    return {
      checks: [
        r.ok && !failed
          ? pass("vitest run", summary)
          : fail("vitest run", `${summary}\n${tail(out, 20)}`),
      ],
    };
  },
};
