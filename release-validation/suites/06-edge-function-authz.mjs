import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { pass, fail, warn } from "../lib/types.mjs";

// Suite 06 — Edge-function authorization (STATIC).
// Every deployed function must enforce caller identity in-code, because the
// platform's verify_jwt is configured off for these. We detect the hardened
// path (authenticateCaller from _shared/auth.ts) or, at minimum, an explicit
// supabase.auth.getUser()/getClaims() check. A privileged function with NO
// auth marker is a release blocker.
//
// PRIVILEGED = mutates org data or brokers cross-tenant storage. These MUST
// authenticate. The remaining functions are external-data proxies (postcode,
// maps, vehicle/business lookup) — auth is reported but not required.
const PRIVILEGED = new Set([
  "assign-driver",
  "get-org-users",
  "user-lifecycle",
  "promote-admin",
  "gcs-upload",
  "gcs-proxy",
  "resolve-signature-url",
  "gcs-fix-acl",
  "vision-ocr",
]);

export default {
  id: "06",
  name: "Edge-function authorization (static)",
  critical: true,
  requiresLiveEnv: false,
  async run({ root }) {
    const base = join(root, "supabase", "functions");
    const checks = [];

    const fns = readdirSync(base).filter(
      (f) => f !== "_shared" && statSync(join(base, f)).isDirectory(),
    );

    for (const fn of fns.sort()) {
      const idx = join(base, fn, "index.ts");
      if (!existsSync(idx)) {
        checks.push(warn(fn, "no index.ts found"));
        continue;
      }
      const src = readFileSync(idx, "utf8");
      const hardened = /authenticateCaller\s*\(/.test(src);
      const explicit = /auth\.getUser\s*\(|getClaims\s*\(/.test(src);
      const privileged = PRIVILEGED.has(fn);

      if (hardened) {
        checks.push(pass(fn, "uses authenticateCaller() (user_profiles authz)"));
      } else if (explicit) {
        checks.push(
          privileged
            ? pass(fn, "explicit auth.getUser()/getClaims() check present")
            : pass(fn, "auth check present"),
        );
      } else if (privileged) {
        checks.push(fail(fn, "PRIVILEGED function with no in-code auth check"));
      } else {
        checks.push(warn(fn, "external-data proxy with no auth check (verify intentional)"));
      }
    }

    return { checks };
  },
};
