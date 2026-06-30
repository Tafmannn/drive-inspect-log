import { pass, fail, notExecuted } from "../lib/types.mjs";
import { run, tail } from "../lib/exec.mjs";

// Suite 07 — TypeScript type-check (STATIC, executed).
// Runs `npm run typecheck` (tsc --noEmit). A type error blocks release.
export default {
  id: "07",
  name: "TypeScript type-check",
  critical: true,
  requiresLiveEnv: false,
  async run({ root, fast }) {
    if (fast) {
      return {
        checks: [
          notExecuted("tsc --noEmit", "skipped in --fast mode — run full `npm run release:validate` before release"),
        ],
        note: "fast mode",
      };
    }
    const r = run("npm", ["run", "--silent", "typecheck"], {
      cwd: root,
      timeoutMs: 300_000,
    });
    return {
      checks: [
        r.ok
          ? pass("tsc --noEmit", "no type errors")
          : fail("tsc --noEmit", tail(r.stdout + "\n" + r.stderr, 20)),
      ],
    };
  },
};
