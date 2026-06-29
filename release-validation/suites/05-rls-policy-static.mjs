import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pass, fail, warn } from "../lib/types.mjs";

// Suite 05 — RLS / security-posture static analysis (STATIC).
// Proves the core Phase 1 invariants hold in the migration source, and surfaces
// the known deferred (Phase 1.5) permissive policies for human sign-off.
//
// This reads the migration history and resolves the LATEST definition of each
// security-definer helper (highest timestamp wins, exactly like Postgres apply
// order) before asserting it no longer trusts self-writable JWT metadata.
const HELPERS = ["is_super_admin", "user_role", "user_org_id"];

function latestHelperBody(dir, files, name) {
  const re = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${name}\\b`, "i");
  let latest = null;
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    const idx = sql.search(re);
    if (idx !== -1) latest = { file: f, body: sql.slice(idx, idx + 1600) };
  }
  return latest; // files are sorted ascending, so the last match is newest
}

export default {
  id: "05",
  name: "RLS / security-posture (static)",
  critical: true,
  requiresLiveEnv: false,
  async run({ root }) {
    const dir = join(root, "supabase", "migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const checks = [];

    // 1) Latest helper definitions must not reference user/app metadata (C4).
    for (const name of HELPERS) {
      const latest = latestHelperBody(dir, files, name);
      if (!latest) {
        checks.push(fail(`${name}() defined`, "no definition found in migrations"));
        continue;
      }
      const trusts = /user_metadata|app_metadata/i.test(latest.body);
      checks.push(
        trusts
          ? fail(
              `${name}() ignores JWT metadata`,
              `latest def (${latest.file}) still references *_metadata`,
            )
          : pass(`${name}() ignores JWT metadata`, `latest def: ${latest.file}`),
      );
    }

    // 2) Signature storage IDOR closure (C1 follow-up) is present in source.
    const sigClose = files.find((f) => /close_signature_storage_idor/.test(f));
    if (sigClose) {
      const sql = readFileSync(join(dir, sigClose), "utf8");
      const drops = (sql.match(/DROP\s+POLICY\s+IF\s+EXISTS\s+"Allow public [^"]*vehicle-signatures"/gi) || []).length;
      checks.push(
        drops >= 4
          ? pass("vehicle-signatures permissive policies dropped", `${drops} DROP statements in ${sigClose}`)
          : fail("vehicle-signatures permissive policies dropped", `expected >=4 DROPs, found ${drops}`),
      );
    } else {
      checks.push(fail("vehicle-signatures permissive policies dropped", "closure migration not found"));
    }

    // 3) Known deferred (Phase 1.5) permissive exposure — surface, do not block.
    const qr = files.some((f) =>
      /FOR\s+ALL[\s\S]{0,80}USING\s*\(\s*true\s*\)/i.test(readFileSync(join(dir, f), "utf8")) &&
      /qr_confirmations/i.test(readFileSync(join(dir, f), "utf8")),
    );
    checks.push(
      qr
        ? warn(
            "qr_confirmations USING(true) — DEFERRED (Phase 1.5)",
            "anon-readable customer PII + tokens; acknowledged out-of-scope for this release. Track for Phase 1.5.",
          )
        : pass("qr_confirmations USING(true)", "no permissive policy found"),
    );

    const vp = files.some((f) =>
      /vehicle-photos/i.test(readFileSync(join(dir, f), "utf8")) &&
      /Allow public[\s\S]{0,60}USING\s*\(\s*true\s*\)/i.test(readFileSync(join(dir, f), "utf8")),
    );
    checks.push(
      vp
        ? warn(
            "vehicle-photos public policies — DEFERRED (Phase 1.5)",
            "bucket still has Allow-public USING(true) policies; privatise after confirming active backend + migrating public URLs.",
          )
        : pass("vehicle-photos public policies", "no permissive policy found"),
    );

    return { checks };
  },
};
