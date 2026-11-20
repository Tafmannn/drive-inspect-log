// Pure: which app origin may links in emails (auth action links, customer
// links) point at? Kept free of Deno imports for vitest
// (src/test/app-origin.test.ts).
//
// The request's Origin header is attacker-controlled (any HTTP client can set
// it), and request-password-reset is unauthenticated. Supabase Auth's
// redirect allow-list is the only other line of defence, and the app lives on
// *.vercel.app, where anyone can host a page — so a wildcard there would hand
// a victim's recovery token to an attacker. Origin is therefore honoured only
// when it is explicitly listed. Otherwise we return null and Supabase falls
// back to its configured Site URL.

export const DEFAULT_APP_ORIGINS = ["https://axentra-app.vercel.app"];

function normalise(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function pickAppOrigin(
  appUrl: string | null | undefined,
  allowedCsv: string | null | undefined,
  requestOrigin: string | null | undefined,
): string | null {
  const configured = normalise(appUrl);
  if (configured) return configured;

  const allowed = new Set(
    (allowedCsv ? allowedCsv.split(",") : DEFAULT_APP_ORIGINS)
      .map((s) => normalise(s))
      .filter((s): s is string => !!s),
  );
  const origin = normalise(requestOrigin);
  return origin && allowed.has(origin) ? origin : null;
}
