import { pass, fail, notExecuted } from "../lib/types.mjs";
import { liveEnv } from "../lib/env.mjs";

// Suite 14 — Storage IDOR path->org authorization (LIVE, HTTP).
// Proves gcs-proxy / resolve-signature-url reject a cross-org object path with
// 403 (C1/C2). Needs the staging functions host plus a driver JWT and a known
// foreign-org object path. Gated to NOT_EXECUTED when those are absent.
//
// Required env to execute:
//   STAGING_SUPABASE_URL      e.g. https://<staging-ref>.supabase.co
//   STAGING_ANON_KEY          staging anon/publishable key
//   STAGING_DRIVER_A_JWT      a signed-in driver (org A) access token
//   STAGING_CROSS_ORG_PATH    an object path owned by a DIFFERENT org, e.g.
//                             jobs/<jobB>/pickup/odometer/x.jpg
export default {
  id: "14",
  name: "Storage IDOR path->org (live HTTP)",
  critical: true,
  requiresLiveEnv: true,
  async run() {
    const env = liveEnv();
    const driverJwt = process.env.STAGING_DRIVER_A_JWT || "";
    const crossPath = process.env.STAGING_CROSS_ORG_PATH || "";
    if (env.pointsAtProd) {
      const reason = `REFUSED: a configured value references the production ref (${env.PROD_REF}).`;
      return { checks: [notExecuted("Cross-org storage read blocked", reason)], note: reason };
    }
    const missing = [];
    if (!env.hasHttp) missing.push("STAGING_SUPABASE_URL");
    if (!env.anonKey) missing.push("STAGING_ANON_KEY");
    if (!driverJwt) missing.push("STAGING_DRIVER_A_JWT");
    if (!crossPath) missing.push("STAGING_CROSS_ORG_PATH (a foreign-org object path)");
    if (missing.length) {
      const reason = `REQUIRES LIVE ENVIRONMENT — not provided: ${missing.join(", ")}`;
      return { checks: [notExecuted("Cross-org storage read blocked", reason)], note: reason };
    }

    const checks = [];
    const base = env.supabaseUrl.replace(/\/+$/, "");

    // gcs-proxy must 403 a cross-org path.
    try {
      const url = `${base}/functions/v1/gcs-proxy?path=${encodeURIComponent(crossPath)}`;
      const res = await fetch(url, {
        headers: { apikey: env.anonKey, Authorization: `Bearer ${driverJwt}` },
      });
      checks.push(
        res.status === 403
          ? pass("gcs-proxy cross-org = 403", `status ${res.status}`)
          : fail("gcs-proxy cross-org = 403", `expected 403, got ${res.status}`),
      );
    } catch (e) {
      checks.push(fail("gcs-proxy cross-org = 403", String(e?.message || e)));
    }

    // resolve-signature-url must 403 a cross-org signature path.
    try {
      const res = await fetch(`${base}/functions/v1/resolve-signature-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: env.anonKey,
          Authorization: `Bearer ${driverJwt}`,
        },
        body: JSON.stringify({ rawUrl: crossPath }),
      });
      checks.push(
        res.status === 403
          ? pass("resolve-signature-url cross-org = 403", `status ${res.status}`)
          : fail("resolve-signature-url cross-org = 403", `expected 403, got ${res.status}`),
      );
    } catch (e) {
      checks.push(fail("resolve-signature-url cross-org = 403", String(e?.message || e)));
    }

    return { checks };
  },
};
