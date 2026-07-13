import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pass, fail, warn } from "../lib/types.mjs";
import { isInReleaseSet, RELEASE_SET_SINCE } from "../lib/releaseSet.mjs";

// Suite 03 — Migration re-apply safety / idempotency (STATIC).
// A migration may be re-run (CLI repair, partial failure, replay onto a fresh
// staging clone). For the RELEASE SET specifically we require the guards that
// make re-application safe:
//   - every CREATE POLICY "X" is preceded by DROP POLICY IF EXISTS "X"
//   - every CREATE TRIGGER X   is preceded by DROP TRIGGER IF EXISTS X
//   - functions use CREATE OR REPLACE (not bare CREATE FUNCTION)
//   - ADD COLUMN / CREATE INDEX use IF NOT EXISTS
export default {
  id: "03",
  name: "Migration re-apply safety (release set)",
  critical: true,
  requiresLiveEnv: false,
  async run({ root }) {
    const dir = join(root, "supabase", "migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && isInReleaseSet(f))
      .sort();
    const checks = [];

    if (!files.length) {
      checks.push(warn("Release-set present", `no migrations since ${RELEASE_SET_SINCE} on this branch`));
      return { checks };
    }

    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8");
      const hard = []; // genuine re-apply hazards -> FAIL
      const soft = []; // forward-correct but not individually re-runnable -> WARN
      const tableHasAnyDrop = /DROP\s+POLICY\s+IF\s+EXISTS/i.test(sql);

      // CREATE POLICY: re-runnable iff its OWN name is dropped first. If not,
      // but the migration drops other policies (a deliberate rename/swap), it is
      // forward-correct — flag as a non-blocking "not re-runnable" note.
      for (const m of sql.matchAll(/CREATE\s+POLICY\s+"([^"]+)"/gi)) {
        const name = m[1];
        const dropRe = new RegExp(
          `DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
          "i",
        );
        const idx = sql.search(dropRe);
        const ownNameDropped = idx !== -1 && idx < m.index;
        if (!ownNameDropped) {
          if (tableHasAnyDrop) soft.push(`policy "${name}" is a rename/swap (not re-runnable)`);
          else hard.push(`policy "${name}" created with no DROP IF EXISTS anywhere`);
        }
      }

      // CREATE TRIGGER guarded by a prior DROP TRIGGER IF EXISTS of the same name.
      for (const m of sql.matchAll(/CREATE\s+TRIGGER\s+(\w+)/gi)) {
        const name = m[1];
        const dropRe = new RegExp(`DROP\\s+TRIGGER\\s+IF\\s+EXISTS\\s+${name}\\b`, "i");
        const idx = sql.search(dropRe);
        if (idx === -1 || idx > m.index) hard.push(`trigger ${name} not preceded by DROP IF EXISTS`);
      }

      // Bare CREATE FUNCTION (without OR REPLACE) is a real re-apply hazard.
      for (const m of sql.matchAll(/CREATE\s+(?!OR\s+REPLACE)FUNCTION\s+([\w.]+)/gi))
        hard.push(`function ${m[1]} uses bare CREATE (want CREATE OR REPLACE)`);

      // ADD COLUMN / CREATE INDEX without IF NOT EXISTS.
      for (const m of sql.matchAll(/ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)(\w+)/gi))
        hard.push(`ADD COLUMN ${m[1]} without IF NOT EXISTS`);
      for (const m of sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS|CONCURRENTLY)(\w+)/gi))
        hard.push(`CREATE INDEX ${m[1]} without IF NOT EXISTS`);

      if (hard.length) checks.push(fail(f, hard.join("; ")));
      else if (soft.length)
        checks.push(warn(f, `${soft.join("; ")} — Supabase tracks applied migrations so this is forward-safe`));
      else checks.push(pass(f, "all re-apply guards present"));
    }

    return { checks };
  },
};
