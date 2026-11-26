// Fail-closed check of which Supabase project a build/runtime talks to.
// Pure (no Vite/Deno globals) so vite.config.ts, the browser client and tests
// share one rule set. See src/test/supabase-target.test.ts.
export const PRODUCTION_REF = "lynkvfduzqdyvlzgriyh";
export const STAGING_REF = "mfedxybzajdgavzmajkl";

export type TargetInput = {
  url?: string | null;
  key?: string | null;
  /** VITE_APP_ENV: "staging" | "production" | undefined */
  appEnv?: string | null;
  /** VERCEL_GIT_COMMIT_REF at build time (undefined in the browser) */
  gitBranch?: string | null;
  /** VERCEL_ENV provided by the build platform */
  deploymentEnv?: string | null;
};

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "===".slice((b64.length + 3) % 4);
    const txt = typeof atob === "function" ? atob(pad) : Buffer.from(pad, "base64").toString("utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

export function projectRefFromUrl(url?: string | null): string | null {
  try {
    const parsed = new URL(String(url ?? ""));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
    const host = parsed.hostname.toLowerCase();
    const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(host);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function checkSupabaseTarget(input: TargetInput): { ok: boolean; ref: string | null; errors: string[] } {
  const errors: string[] = [];
  const ref = projectRefFromUrl(input.url);
  const key = String(input.key ?? "");
  const appEnv = String(input.appEnv ?? "").trim().toLowerCase();
  const branch = String(input.gitBranch ?? "");
  const deploymentEnv = String(input.deploymentEnv ?? "").toLowerCase();
  if (deploymentEnv === "preview" && (appEnv !== "staging" || ref !== STAGING_REF)) {
    errors.push("Every Vercel preview must explicitly target staging; production fallback is forbidden");
  }
  if (deploymentEnv === "production" && ref !== PRODUCTION_REF) {
    errors.push("Vercel production must target the production project");
  }

  // Local dev/tests may use a local Supabase; a declared environment may not.
  if (!ref && appEnv) errors.push("VITE_SUPABASE_URL is not a https://<ref>.supabase.co URL");
  if (!key) errors.push("VITE_SUPABASE_PUBLISHABLE_KEY is missing");
  if (key.startsWith("sb_secret_")) errors.push("a secret key must never be bundled into the browser");
  if (key.split(".").length === 3) {
    const claims = b64urlJson(key.split(".")[1]);
    if (claims?.role === "service_role") errors.push("a service_role key must never be bundled into the browser");
    if (claims?.ref && ref && claims.ref !== ref) errors.push(`publishable key belongs to project ${claims.ref}, URL to ${ref}`);
  }
  if (/^(staging|deploy-preview\/staging)(\/|$)/.test(branch) && appEnv !== "staging") {
    errors.push(`branch ${branch} must build with VITE_APP_ENV=staging`);
  }
  if (appEnv === "staging" && ref !== STAGING_REF) {
    errors.push(`VITE_APP_ENV=staging requires the staging project (${STAGING_REF}), got ${ref ?? "none"}`);
  }
  if (appEnv === "production" && ref !== PRODUCTION_REF) {
    errors.push(`VITE_APP_ENV=production requires the production project, got ${ref ?? "none"}`);
  }
  if (appEnv && !["staging", "production"].includes(appEnv)) errors.push(`unsupported VITE_APP_ENV ${appEnv}`);
  return { ok: errors.length === 0, ref, errors };
}
