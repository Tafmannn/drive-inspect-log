// Shared Axentra-branded transactional email (invite, password reset, ...).
// Kept separate from POD's own renderHtml (send-pod-email/index.ts) since
// that one is customer-facing with different content; this module is for
// internal-user auth emails sent via Resend, replacing Supabase's generic
// default templates.

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The page an auth action link should land on after Supabase verifies the
 * token. Prefers an explicit APP_URL secret; otherwise falls back to the
 * calling app's Origin header. Supabase Auth only ever redirects to URLs on
 * its allow-list, so a forged Origin can't leak the token to an
 * attacker-controlled host — the redirect would just fall back to the Site URL.
 */
export function resolveRedirectUrl(req: Request, path: string): string | undefined {
  const candidate = Deno.env.get("APP_URL") || req.headers.get("origin") || "";
  try {
    const u = new URL(candidate);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    return `${u.origin}${path}`;
  } catch {
    return undefined;
  }
}

export function renderActionEmailHtml(opts: {
  firstName: string | null;
  introHtml: string;
  buttonLabel: string;
  actionLink: string;
  noteHtml: string;
}): string {
  const greeting = opts.firstName ? `Hi ${escapeHtml(opts.firstName)},` : "Hi,";
  const href = escapeHtml(opts.actionLink);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#111827;padding:20px 32px;">
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">Axentra Vehicle Logistics</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 16px;">${greeting}</p>
                <p style="margin:0 0 24px;">${opts.introHtml}</p>
                <p style="margin:0 0 24px;text-align:center;">
                  <a href="${href}"
                     style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;display:inline-block;">
                    ${escapeHtml(opts.buttonLabel)}
                  </a>
                </p>
                <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">${opts.noteHtml}</p>
                <p style="margin:0 0 16px;color:#6b7280;font-size:13px;word-break:break-all;">
                  If the button doesn't work, copy and paste this link into your browser:<br/>
                  <a href="${href}" style="color:#2563eb;">${href}</a>
                </p>
                <p style="margin:24px 0 0;">Kind regards,<br/>Axentra Vehicle Logistics<br/>info@axentravehicles.com</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

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
