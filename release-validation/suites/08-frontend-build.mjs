import { pass, fail, notExecuted } from "../lib/types.mjs";
import { run, tail } from "../lib/exec.mjs";

// Suite 08 — Production build (STATIC, executed).
// Runs `npm run build` (vite build). The bundle must compile cleanly; the
// pre-existing chunk-size advisory is not treated as a failure.
export default {
  id: "08",
  name: "Production build",
  critical: true,
  requiresLiveEnv: false,
  async run({ root, fast }) {
    if (fast) {
      return {
        checks: [
          notExecuted("vite build", "skipped in --fast mode — run full `npm run release:validate` before release"),
        ],
        note: "fast mode",
      };
    }
    const r = run("npm", ["run", "--silent", "build"], {
      cwd: root,
      timeoutMs: 600_000,
    });
    const out = r.stdout + "\n" + r.stderr;
    return {
      checks: [
        r.ok
          ? pass("vite build", tail(out, 6) || "build succeeded")
          : fail("vite build", tail(out, 24)),
      ],
    };
  },
};
