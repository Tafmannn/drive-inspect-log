// Environment-aware outbound e-mail guard (pure; unit-tested in
// src/test/delivery-guard.test.ts).
//
// Production (SUPABASE_URL host = the production project) is unchanged: every
// recipient is allowed. Staging delivers ONLY to allowlisted recipients
// (STAGING_EMAIL_ALLOWLIST: comma-separated domains or full addresses; default
// the reserved axentra-staging.test domain), so a staging deployment can never
// e-mail a real customer even if it is given a real provider key. Any other or
// missing project fails closed (nothing is sent).
const PRODUCTION_REF = "lynkvfduzqdyvlzgriyh";
const STAGING_REF = "mfedxybzajdgavzmajkl";
const DEFAULT_STAGING_ALLOWLIST = "axentra-staging.test";

export type DeliveryEnvironment = "production" | "staging" | "unknown";

export function deliveryEnvironment(supabaseUrl: string | undefined | null): DeliveryEnvironment {
  let host = "";
  try {
    host = new URL(String(supabaseUrl ?? "")).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (host === `${PRODUCTION_REF}.supabase.co`) return "production";
  if (host === `${STAGING_REF}.supabase.co`) return "staging";
  return "unknown";
}

export function emailDeliveryDecision(
  to: string,
  env: { supabaseUrl?: string | null; stagingAllowlist?: string | null },
): { send: boolean; environment: DeliveryEnvironment; reason?: string } {
  const environment = deliveryEnvironment(env.supabaseUrl);
  if (environment === "production") return { send: true, environment };
  if (environment === "unknown") return { send: false, environment, reason: "UNKNOWN_ENVIRONMENT_EMAIL_SUPPRESSED" };
  const addr = String(to ?? "").trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at < 1) return { send: false, environment, reason: "STAGING_RECIPIENT_NOT_ALLOWLISTED" };
  const domain = addr.slice(at + 1);
  const allow = String(env.stagingAllowlist || DEFAULT_STAGING_ALLOWLIST)
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ok = allow.some((entry) => (entry.includes("@") ? entry === addr : entry === domain));
  return ok ? { send: true, environment } : { send: false, environment, reason: "STAGING_RECIPIENT_NOT_ALLOWLISTED" };
}

/** Deno wrapper reading the function's own environment. */
export function emailDeliveryGate(to: string) {
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
  return emailDeliveryDecision(to, {
    supabaseUrl: env?.get("SUPABASE_URL"),
    stagingAllowlist: env?.get("STAGING_EMAIL_ALLOWLIST"),
  });
}
