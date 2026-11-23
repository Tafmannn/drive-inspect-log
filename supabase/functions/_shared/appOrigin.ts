// Pure: which app origin may links in emails (auth action links, customer
// links) point at? Kept free of Deno imports for vitest
// (src/test/app-origin.test.ts).
//
// The request's Origin header is attacker-controlled (any HTTP client can set
// it), and request-password-reset is unauthenticated. Supabase Auth's
// redirect allow-list is the only other line of defence, and the app lives on
// *.vercel.app, where anyone can host a page — so a wildcard there would hand
// a victim's recovery token to an attacker. Origin is therefore honoured only
// when it is explicitly listed. Otherwise we fall back to the canonical app
// origin (never Supabase's Site URL, and never a Lovable preview host).

export const DEFAULT_APP_ORIGINS = ["https://axentra-app.vercel.app"];

/**
 * Lovable-hosted builds (*.lovable.app, *.lovableproject.com) are editor
 * previews, not the app customers and staff use. Links must never point
 * there, even if APP_URL or the allow-list is set to one.
 */
export function isLovableHost(origin: string): boolean {
  try {
    const h = new URL(origin).hostname.toLowerCase();
    return h === "lovable.app" || h.endsWith(".lovable.app") || h === "lovableproject.com" || h.endsWith(".lovableproject.com");
  } catch {
    return false;
  }
}

function normalise(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    if (isLovableHost(u.origin)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function pickAppOrigin(
  appUrl: string | null | undefined,
  allowedCsv: string | null | undefined,
  requestOrigin: string | null | undefined,
): string {
  const configured = normalise(appUrl);
  if (configured) return configured;

  const allowedList = (allowedCsv ? allowedCsv.split(",") : DEFAULT_APP_ORIGINS)
    .map((s) => normalise(s))
    .filter((s): s is string => !!s);
  const allowed = new Set(allowedList);
  const origin = normalise(requestOrigin);
  if (origin && allowed.has(origin)) return origin;
  // Never hand the choice to Supabase's Site URL (which may be a Lovable
  // preview): fall back to the canonical app — the first allowed origin, or
  // the production default. A fixed value, so a forged Origin can't steer it.
  return allowedList[0] ?? DEFAULT_APP_ORIGINS[0];
}
