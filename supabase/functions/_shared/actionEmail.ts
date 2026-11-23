// Axentra-branded action email template (invite, portal access, password
// reset). Pure and Deno-free so vitest can import it
// (src/test/branded-action-email.test.ts); brandedEmail.ts re-exports it.

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Brand palette (matches the app and the POD email).
const NAVY = "#08152E";
const NAVY_GRADIENT = "linear-gradient(135deg,#040B1A 0%,#0C2148 100%)";
const COBALT = "#1E4FA8"; // app --primary
const INK = "#0F1B2D";
const MUTED = "#5B6779";
const PAGE_BG = "#EEF2F7";
export const SUPPORT_EMAIL = "info@axentravehicles.com";

/**
 * Axentra-branded action email (invite, portal access, password reset).
 * Table layout with bgcolor attributes and colour-scheme hints so it keeps
 * its navy banner and cobalt button in Gmail/Apple Mail, including dark mode.
 */
export function renderActionEmailHtml(opts: {
  firstName: string | null;
  introHtml: string;
  buttonLabel: string;
  actionLink: string;
  noteHtml: string;
  /** Absolute https URL of the banner logo (see brandLogoUrl). */
  logoUrl?: string | null;
  /** Short line shown above the greeting, e.g. "Customer portal". */
  eyebrow?: string;
}): string {
  const greeting = opts.firstName ? `Hi ${escapeHtml(opts.firstName)},` : "Hi,";
  const href = escapeHtml(opts.actionLink);
  const logo = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" width="168" alt="Axentra" style="display:block;width:168px;max-width:168px;height:auto;border:0;margin:0 auto;">`
    : `<span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:6px;">AXENTRA</span>`;
  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 6px;color:${COBALT};font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(opts.eyebrow)}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Axentra Vehicle Logistics</title>
  </head>
  <body style="margin:0;padding:0;background-color:${PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE_BG}" style="background-color:${PAGE_BG};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr><td align="center" bgcolor="${NAVY}" style="background-color:${NAVY};background-image:${NAVY_GRADIENT};padding:28px 24px 24px;">${logo}</td></tr>
            <tr><td bgcolor="${COBALT}" style="height:4px;line-height:4px;font-size:0;background-color:${COBALT};background-image:linear-gradient(90deg,${COBALT} 0%,#0C2148 100%);">&nbsp;</td></tr>
            <tr>
              <td bgcolor="#ffffff" style="background-color:#ffffff;padding:32px 32px 8px;color:${INK};font-size:16px;line-height:1.6;">
                ${eyebrow}
                <p style="margin:0 0 16px;font-size:18px;font-weight:bold;color:${INK};">${greeting}</p>
                <p style="margin:0 0 28px;color:${INK};">${opts.introHtml}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 28px;">
                  <tr>
                    <td align="center" bgcolor="${COBALT}" style="background-color:${COBALT};border-radius:10px;">
                      <a href="${href}" style="display:inline-block;padding:14px 32px;color:#ffffff;background-color:${COBALT};border-radius:10px;font-size:16px;font-weight:bold;text-decoration:none;">${escapeHtml(opts.buttonLabel)}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 16px;color:${MUTED};font-size:13px;line-height:1.5;">${opts.noteHtml}</p>
                <p style="margin:0 0 24px;color:${MUTED};font-size:12px;line-height:1.5;word-break:break-all;">
                  If the button doesn't work, copy and paste this link into your browser:<br>
                  <a href="${href}" style="color:${COBALT};">${href}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#F6F8FB" style="background-color:#F6F8FB;padding:20px 32px;border-top:1px solid #E3E8EF;color:${MUTED};font-size:12px;line-height:1.6;">
                <strong style="color:${INK};">Axentra Vehicle Logistics</strong><br>
                Questions? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:${COBALT};">${SUPPORT_EMAIL}</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Intro line for a customer-portal invite. Omits "for <client>" when it would
 * just repeat the operator's name (e.g. an operator testing with its own name).
 */
export function portalInviteIntroHtml(operatorName: string, clientName: string): string {
  const op = operatorName.trim(), cl = clientName.trim();
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const same = !cl || norm(op).includes(norm(cl)) || norm(cl).includes(norm(op));
  return (
    `<strong>${escapeHtml(op)}</strong> has set up your customer portal` +
    (same ? "" : ` for <strong>${escapeHtml(cl)}</strong>`) +
    ". Track your vehicle moves, see collection and delivery photos and signatures, and download your invoices, any time."
  );
}
