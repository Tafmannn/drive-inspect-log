import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pass, fail } from "../lib/types.mjs";
import { isInReleaseSet } from "../lib/releaseSet.mjs";

// Suite 04 — Rollback coverage for the release set (STATIC).
// Every migration shipped in this release must have a matching, non-trivial
// .down.sql so a failed gate can be reversed. We match by exact base name:
//   supabase/migrations/<base>.sql  ->  supabase/rollback/<base>.down.sql
export default {
  id: "04",
  name: "Rollback coverage (release set)",
  critical: true,
  requiresLiveEnv: false,
  async run({ root }) {
    const migDir = join(root, "supabase", "migrations");
    const rbDir = join(root, "supabase", "rollback");
    const checks = [];

    const releaseSet = readdirSync(migDir)
      .filter((f) => f.endsWith(".sql") && isInReleaseSet(f))
      .sort();

    for (const f of releaseSet) {
      const base = f.replace(/\.sql$/, "");
      const downPath = join(rbDir, `${base}.down.sql`);
      if (!existsSync(downPath)) {
        checks.push(fail(f, `missing rollback: supabase/rollback/${base}.down.sql`));
        continue;
      }
      const body = readFileSync(downPath, "utf8").trim();
      const meaningful = /\b(drop|alter|create|update|delete|revoke)\b/i.test(body);
      checks.push(
        body.length > 20 && meaningful
          ? pass(f, `rollback present (${body.split("\n").length} lines)`)
          : fail(f, "rollback file exists but is empty/trivial"),
      );
    }

    if (!releaseSet.length)
      checks.push(pass("Release set", "no release-set migrations to cover"));

    return { checks };
  },
};
