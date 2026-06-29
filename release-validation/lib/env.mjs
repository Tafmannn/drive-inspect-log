// Centralised detection of whether a live environment is reachable.
//
// The framework is split into two halves:
//   - STATIC suites run anywhere (CI, a laptop, this container) against the
//     repository on disk. They are always executed.
//   - LIVE suites need a real Supabase project (database URL, service-role key,
//     function host). When those are absent, the suite emits NOT_EXECUTED with
//     a precise note about what is missing — it is never silently passed.
//
// No production ref is ever accepted here: like the staging rollout script, we
// hard-refuse the known production project ref so the framework cannot be
// pointed at prod by accident.
const PROD_REF = "lynkvfduzqdyvlzgriyh";

export function liveEnv() {
  const dbUrl =
    process.env.STAGING_DB_URL ||
    process.env.RELEASE_VALIDATION_DB_URL ||
    "";
  const projectRef =
    process.env.STAGING_REF || process.env.RELEASE_VALIDATION_REF || "";
  const supabaseUrl =
    process.env.STAGING_SUPABASE_URL ||
    process.env.RELEASE_VALIDATION_SUPABASE_URL ||
    "";
  const serviceKey =
    process.env.STAGING_SERVICE_ROLE_KEY ||
    process.env.RELEASE_VALIDATION_SERVICE_ROLE_KEY ||
    "";
  const anonKey =
    process.env.STAGING_ANON_KEY ||
    process.env.RELEASE_VALIDATION_ANON_KEY ||
    "";

  const pointsAtProd =
    dbUrl.includes(PROD_REF) ||
    projectRef === PROD_REF ||
    supabaseUrl.includes(PROD_REF);

  return {
    PROD_REF,
    dbUrl,
    projectRef,
    supabaseUrl,
    serviceKey,
    anonKey,
    pointsAtProd,
    hasDb: Boolean(dbUrl) && !pointsAtProd,
    hasHttp: Boolean(supabaseUrl) && !pointsAtProd,
  };
}

// Human-readable reason a live suite could not run, given what it needs.
export function missingLiveReason(need = {}) {
  const env = liveEnv();
  if (env.pointsAtProd) {
    return `REFUSED: a configured value references the production ref (${PROD_REF}). The framework never targets production.`;
  }
  const missing = [];
  if (need.db && !env.hasDb) missing.push("STAGING_DB_URL (staging Postgres URL)");
  if (need.http && !env.hasHttp)
    missing.push("STAGING_SUPABASE_URL (staging functions host)");
  if (need.serviceKey && !env.serviceKey)
    missing.push("STAGING_SERVICE_ROLE_KEY");
  if (need.anonKey && !env.anonKey) missing.push("STAGING_ANON_KEY");
  if (!missing.length) return "";
  return `REQUIRES LIVE ENVIRONMENT — not provided: ${missing.join(", ")}.`;
}
