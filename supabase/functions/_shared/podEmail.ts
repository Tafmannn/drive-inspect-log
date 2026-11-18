// Proof of Delivery email: branded content, recipient rules, link checks.
//
// Pure and dependency-free (no Deno or Supabase imports) so it can be
// unit-tested under vitest (src/test/pod-email.test.ts) and used by the
// send-pod-email edge function.

import {
  cleanRecipients,
  escapeHtml,
  formatUkDateTime,
  safeColour,
  safeHttpsUrl,
} from "./customerStatusEmail.ts";

// ── Branding ────────────────────────────────────────────────────────────────

/**
 * The organisation's logo as an absolute https URL. organisations.logo_url
 * may be absolute (https only) or a path served by the app itself, e.g.
 * "/email/axentra-logo-email.jpg", resolved against the app's base URL.
 */
export function resolveLogoUrl(logoUrl: string | null | undefined, appBaseUrl: string | null): string | null {
  const v = (logoUrl ?? "").trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//")) {
    if (!appBaseUrl) return null;
    return safeHttpsUrl(`${appBaseUrl.replace(/\/+$/, "")}${v}`);
  }
  return safeHttpsUrl(v);
}

/**
 * The logo for the dark navy email banner. The organisation's stored logo
 * (/email/axentra-logo-email.jpg) has a black background baked in, which would
 * show as a black box on navy, so for that default we use the transparent
 * version served by the app. A different logo set on the organisation is
 * used as given.
 */
export const EMAIL_LOGO_ON_NAVY = "/email/axentra-logo-email-dark.png";
const LEGACY_DEFAULT_LOGO = "/email/axentra-logo-email.jpg";

export function resolveEmailLogoUrl(logoUrl: string | null | undefined, appBaseUrl: string | null): string | null {
  const v = (logoUrl ?? "").trim();
  if (!v || v === LEGACY_DEFAULT_LOGO) return resolveLogoUrl(EMAIL_LOGO_ON_NAVY, appBaseUrl);
  return resolveLogoUrl(v, appBaseUrl);
}

// ── Links ───────────────────────────────────────────────────────────────────

/**
 * True only for a signed download URL from this project's own storage, in
 * the given bucket. Stops a caller from putting an arbitrary link behind the
 * "Download Proof of Delivery" button of an email sent in the company's name.
 */
export function isOwnSignedStorageUrl(url: unknown, supabaseUrl: string, bucket: string): boolean {
  if (typeof url !== "string" || !supabaseUrl) return false;
  try {
    const u = new URL(url);
    const base = new URL(supabaseUrl);
    return (
      u.protocol === "https:" &&
      u.host === base.host &&
      u.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`) &&
      u.searchParams.has("token")
    );
  } catch {
    return false;
  }
}

// ── Recipients ──────────────────────────────────────────────────────────────

export type RecipientDecision =
  | { allowed: true; saveToJob: boolean }
  | { allowed: false; onFile: string[] };

/**
 * Who may this caller email the POD to?
 *
 * Admins: anyone (they confirm the address in the app).
 * Drivers: an email on file for the job or its client. If NOTHING is on file,
 *   the address they enter is accepted, and saved to the job so it is then
 *   the one on file — a driver can never redirect a POD away from an address
 *   that was already recorded.
 * In every allowed case, the address is saved to the job when the job had
 * no contact email of its own.
 */
export function decidePodRecipient(opts: {
  isAdmin: boolean;
  to: string;
  jobEmails: (string | null | undefined)[];
  clientEmails: (string | null | undefined)[];
}): RecipientDecision {
  const to = (opts.to ?? "").trim().toLowerCase();
  const jobOnFile = cleanRecipients(opts.jobEmails);
  const onFile = cleanRecipients([...opts.jobEmails, ...opts.clientEmails]);
  const saveToJob = jobOnFile.length === 0;
  if (opts.isAdmin) return { allowed: true, saveToJob };
  if (onFile.length === 0 || onFile.includes(to)) return { allowed: true, saveToJob };
  return { allowed: false, onFile };
}

// ── Email ───────────────────────────────────────────────────────────────────

export interface PodEmailInput {
  /** "collection" sends a Proof of Collection. Default: Proof of Delivery. */
  kind?: "delivery" | "collection";
  operator: {
    name: string;
    logoUrl?: string | null;
    primaryColour?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
  };
  recipientName?: string | null;
  job: {
    ref: string;
    reg: string;
    make?: string | null;
    model?: string | null;
    from?: string | null;
    to?: string | null;
  };
  /** When the vehicle was delivered (or, for a collection, collected). */
  deliveredAt?: string | null;
  /** Who received it (or, for a collection, released it). */
  receivedBy?: string | null;
  podUrl: string;
  photosUrl?: string | null;
}

export interface RenderedPodEmail {
  subject: string;
  html: string;
  text: string;
}

// Banner: very dark navy (a solid fallback for clients that ignore gradients).
const HEADER_BG = "#08152E";
const HEADER_GRADIENT = "linear-gradient(135deg,#040B1A 0%,#0C2148 100%)";

export function renderPodEmail(input: PodEmailInput): RenderedPodEmail {
  const operator = (input.operator.name || "").trim() || "Your vehicle logistics provider";
  const brand = safeColour(input.operator.primaryColour);
  const logo = safeHttpsUrl(input.operator.logoUrl);
  const reg = (input.job.reg || "").trim().toUpperCase() || "Your vehicle";
  const ref = (input.job.ref || "").trim();
  const makeModel = [input.job.make, input.job.model].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  const vehicle = makeModel ? `${reg} · ${makeModel}` : reg;
  const delivered = formatUkDateTime(input.deliveredAt);
  const name = (input.recipientName ?? "").trim();
  const greeting = name ? `Hello ${name},` : "Hello,";
  const phone = (input.operator.contactPhone ?? "").trim();
  const email = (input.operator.contactEmail ?? "").trim();
  const address = (input.operator.address ?? "").trim();
  const photosUrl = input.photosUrl ? safeHttpsUrl(input.photosUrl) : null;
  const podUrl = safeHttpsUrl(input.podUrl);

  const isCollection = input.kind === "collection";
  const docName = isCollection ? "Proof of Collection" : "Proof of Delivery";
  const verb = isCollection ? "collected" : "delivered";
  const subject = ref ? `${docName} – ${reg} (${ref})` : `${docName} – ${reg}`;
  const lead = isCollection
    ? "We've collected your vehicle. Your signed Proof of Collection, " +
      "including the collection inspection report and photos, is ready to download."
    : "We've completed the delivery of your vehicle. Your signed Proof of Delivery, " +
      "including the collection and delivery inspection reports, is ready to download.";

  const rows: [string, string][] = [];
  if (ref) rows.push(["Reference", ref]);
  rows.push(["Vehicle", vehicle]);
  if (input.job.from) rows.push(["Collected from", input.job.from]);
  if (input.job.to) rows.push([isCollection ? "Going to" : "Delivered to", input.job.to]);
  if (delivered) rows.push([isCollection ? "Collected" : "Delivered", delivered]);
  if (input.receivedBy?.trim()) rows.push([isCollection ? "Released by" : "Received by", input.receivedBy.trim()]);

  const contactLine = [phone && `call ${phone}`, "reply to this email"].filter(Boolean).join(" or ");

  // ── Plain text ──
  const text = [
    `${docName.toUpperCase()} — ${reg} has been ${verb}`,
    "",
    greeting,
    "",
    lead,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...(podUrl ? [`Download ${docName} (PDF):`, podUrl, ""] : []),
    ...(photosUrl ? [`Download vehicle photos (ZIP):`, photosUrl, ""] : []),
    "These links are valid for 30 days. Please save a copy for your records.",
    "",
    `Questions about this ${isCollection ? "collection" : "delivery"}? Please ${contactLine}.`,
    "",
    "Kind regards,",
    operator,
    ...[phone, email, address].filter(Boolean),
  ].join("\n");

  // ── HTML ──
  const rowsHtml = rows
    .map(
      ([k, v], i) =>
        `<tr><td style="padding:10px 16px;color:#6b7280;font-size:13px;width:38%;vertical-align:top;${i ? "border-top:1px solid #eef0f3;" : ""}">${escapeHtml(k)}</td>` +
        `<td style="padding:10px 16px;color:#111827;font-size:14px;font-weight:600;vertical-align:top;${i ? "border-top:1px solid #eef0f3;" : ""}">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  const header = logo
    ? `<img src="${escapeHtml(logo)}" width="176" alt="${escapeHtml(operator)}" style="display:block;width:176px;max-width:176px;height:auto;border:0;margin:0 auto;">`
    : `<span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:4px;">${escapeHtml(operator.toUpperCase())}</span>`;

  const podButton = podUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 12px;"><tr><td style="border-radius:8px;background:${brand};">
         <a href="${escapeHtml(podUrl)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;">Download ${docName} (PDF)</a>
       </td></tr></table>`
    : "";
  const photosLink = photosUrl
    ? `<p style="margin:0 0 4px;text-align:center;font-size:14px;"><a href="${escapeHtml(photosUrl)}" style="color:${brand};text-decoration:underline;">Download vehicle photos (ZIP)</a></p>`
    : "";

  const footerBits = [phone, email].filter(Boolean).map(escapeHtml).join(" &nbsp;·&nbsp; ");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(`${reg} has been ${verb}. Your ${docName} is ready to download.`)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr><td align="center" bgcolor="${HEADER_BG}" style="background-color:${HEADER_BG};background-image:${HEADER_GRADIENT};padding:28px 24px 24px;">${header}</td></tr>
          <tr><td bgcolor="${brand}" style="height:4px;line-height:4px;font-size:0;background-color:${brand};background-image:linear-gradient(90deg,${brand} 0%,#0C2148 100%);">&nbsp;</td></tr>
          <tr><td style="padding:32px 32px 8px;color:#1f2937;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 6px;color:${brand};font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">${docName}</p>
            <h1 style="margin:0 0 20px;color:#111827;font-size:24px;line-height:1.3;font-weight:bold;">${escapeHtml(reg)} has been ${verb}</h1>
            <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 24px;">${escapeHtml(lead)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;">
              ${rowsHtml}
            </table>
            ${podButton}
            ${photosLink}
            <p style="margin:16px 0 0;text-align:center;color:#6b7280;font-size:12px;">These links are valid for 30 days. Please save a copy for your records.</p>
          </td></tr>
          <tr><td style="padding:24px 32px 32px;color:#374151;font-size:14px;line-height:1.6;">
            <p style="margin:0 0 16px;">Questions about this ${isCollection ? "collection" : "delivery"}? Please ${escapeHtml(contactLine)}.</p>
            <p style="margin:0;">Kind regards,<br><strong>${escapeHtml(operator)}</strong></p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#f9fafb;border-top:1px solid #eef0f3;color:#6b7280;font-size:12px;line-height:1.6;text-align:center;">
            <strong style="color:#374151;">${escapeHtml(operator)}</strong>${footerBits ? `<br>${footerBits}` : ""}${address ? `<br>${escapeHtml(address)}` : ""}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
