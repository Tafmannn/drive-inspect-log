// Shared Axentra-branded transactional email (invite, password reset, ...).
// Kept separate from POD's own renderHtml (send-pod-email/index.ts) since
// that one is customer-facing with different content; this module is for
// internal-user auth emails sent via Resend, replacing Supabase's generic
// default templates.

import { pickAppOrigin } from "./appOrigin.ts";
import { EMAIL_LOGO_ON_NAVY, resolveLogoUrl } from "./podEmail.ts";
import { emailDeliveryGate } from "./deliveryGuard.ts";

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The page an auth action link should land on after Supabase verifies the
 * token: APP_URL, or the request Origin only if it is explicitly allowed
 * (APP_ALLOWED_ORIGINS, default the production app). Never an arbitrary
 * Origin, and never a Lovable preview host — see appOrigin.ts. Falls back to
 * the canonical app origin rather than Supabase's Site URL.
 */
export function resolveRedirectUrl(req: Request, path: string): string {
  const origin = pickAppOrigin(
    Deno.env.get("APP_URL"),
    Deno.env.get("APP_ALLOWED_ORIGINS"),
    req.headers.get("origin"),
  );
  return `${origin}${path}`;
}

/**
 * Absolute URL of the transparent Axentra logo for the navy banner, served by
 * the app (same asset as the POD email). null when no app origin is known;
 * the template then falls back to a text wordmark.
 */
export function brandLogoUrl(req: Request): string | null {
  const origin = pickAppOrigin(
    Deno.env.get("APP_URL"),
    Deno.env.get("APP_ALLOWED_ORIGINS"),
    req.headers.get("origin"),
  );
  return resolveLogoUrl(EMAIL_LOGO_ON_NAVY, origin);
}

export { renderActionEmailHtml, portalInviteIntroHtml, appTokenLink, SUPPORT_EMAIL } from "./actionEmail.ts";

/** Sends via Resend. Returns ok:false (with detail) if RESEND_API_KEY is unset or the send fails. */
export async function sendBrandedEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; detail?: unknown }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) return { ok: false, detail: "RESEND_API_KEY not configured" };

  const fromAddress =
    Deno.env.get("INVITE_EMAIL_FROM") ||
    Deno.env.get("POD_EMAIL_FROM") ||
    "Axentra Vehicle Logistics <onboarding@resend.dev>";

  const gate = emailDeliveryGate(opts.to);
  if (!gate.send) return { ok: false, detail: gate.reason };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    return { ok: false, detail };
  }
  return { ok: true };
}
