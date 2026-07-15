// Shared helpers for the public marketing enquiry edge functions
// (submit-movement-request, submit-driver-application).
//
// These endpoints are PUBLIC (no caller auth) — anyone on the marketing site
// posts to them — so they lean on: per-IP rate limiting, a honeypot, strict
// server-side validation, and service-role inserts into RLS-locked tables.

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I, L, O, 0, 1

/** Collision-resistant public reference: AXE-YYYYMMDD-XXXX. Authoritative. */
export function createEnquiryReference(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `AXE-${yyyy}${mm}${dd}-${suffix}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Strips C0 control chars + DEL from user input. Built via RegExp() from unicode
// escapes so no literal control bytes live in source.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/** Trim + cap length. Returns null for empty. Strips control characters. */
export function cleanStr(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(CONTROL_CHARS, "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export interface ResendResult {
  attempted: boolean;
  ok: boolean;
}

/**
 * Sends an email via Resend. If RESEND_API_KEY is not configured the send is a
 * no-op (attempted:false) so the enquiry still persists and returns a reference
 * — never a fake success, and never a hard failure that loses the lead.
 */
export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<ResendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { attempted: false, ok: false };

  const from =
    Deno.env.get("MARKETING_EMAIL_FROM") ||
    Deno.env.get("POD_EMAIL_FROM") ||
    "Axentra Vehicle Logistics <onboarding@resend.dev>";

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    return { attempted: true, ok: resp.ok };
  } catch {
    return { attempted: true, ok: false };
  }
}

/** Where internal lead notifications are sent. Falls back to the from-domain. */
export function internalNotifyAddress(): string | null {
  return (
    Deno.env.get("MARKETING_LEAD_NOTIFY_TO") ||
    Deno.env.get("POD_EMAIL_FROM") ||
    null
  );
}
