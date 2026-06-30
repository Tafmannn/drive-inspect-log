import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pass, fail, warn, notExecuted } from "../lib/types.mjs";
import { run } from "../lib/exec.mjs";
import { liveEnv } from "../lib/env.mjs";

// Suite 01 — Environment & configuration hygiene (STATIC).
// Confirms the toolchain, env template, and secret-hygiene preconditions the
// rest of the run depends on, and reports whether a live env is wired up.
export default {
  id: "01",
  name: "Environment & configuration",
  critical: true,
  requiresLiveEnv: false,
  async run({ root }) {
    const checks = [];

    // Node major version (runner + Vite both expect a modern Node).
    const major = Number(process.versions.node.split(".")[0]);
    checks.push(
      major >= 18
        ? pass("Node >= 18", `node ${process.version}`)
        : fail("Node >= 18", `found ${process.version}`),
    );

    // package.json must expose the scripts the heavy suites shell out to.
    const pkgPath = join(root, "package.json");
    if (!existsSync(pkgPath)) {
      checks.push(fail("package.json present", "not found"));
    } else {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      for (const s of ["build", "test", "typecheck"]) {
        checks.push(
          pkg.scripts?.[s]
            ? pass(`npm script: ${s}`, pkg.scripts[s])
            : fail(`npm script: ${s}`, "missing from package.json"),
        );
      }
      checks.push(
        pkg.scripts?.["release:validate"]
          ? pass("npm script: release:validate", pkg.scripts["release:validate"])
          : warn("npm script: release:validate", "not yet wired into package.json"),
      );
    }

    // .env.example must exist and must NOT contain a real anon/service key.
    const examplePath = join(root, ".env.example");
    if (!existsSync(examplePath)) {
      checks.push(warn(".env.example present", "missing — devs have no template"));
    } else {
      const ex = readFileSync(examplePath, "utf8");
      const looksFilled = /=("?)(eyJ[A-Za-z0-9_-]{20,}|sb_[A-Za-z0-9]{20,})/.test(ex);
      checks.push(
        looksFilled
          ? fail(".env.example holds no real key", "a JWT/secret-looking value is committed")
          : pass(".env.example holds no real key", "placeholders only"),
      );
    }

    // .env must be gitignored and untracked.
    const tracked = run("git", ["ls-files", "--error-unmatch", ".env"], {
      cwd: root,
      timeoutMs: 10_000,
    });
    checks.push(
      tracked.ok
        ? fail(".env not tracked by git", ".env is committed — rotate keys & untrack")
        : pass(".env not tracked by git", "untracked / gitignored"),
    );

    // Report (do not fail on) whether a live environment is configured.
    const env = liveEnv();
    if (env.pointsAtProd) {
      checks.push(
        fail(
          "live env is not production",
          `a configured value references the production ref (${env.PROD_REF})`,
        ),
      );
    } else if (env.hasDb || env.hasHttp) {
      checks.push(
        pass(
          "live env configured (staging)",
          `db=${env.hasDb ? "yes" : "no"} http=${env.hasHttp ? "yes" : "no"} serviceKey=${env.serviceKey ? "yes" : "no"}`,
        ),
      );
    } else {
      checks.push(
        notExecuted(
          "live env configured (staging)",
          "no STAGING_DB_URL / STAGING_SUPABASE_URL set — live suites will be gated",
        ),
      );
    }

    return { checks };
  },
};
