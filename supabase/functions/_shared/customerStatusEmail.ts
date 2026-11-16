// Customer-facing "collected" / "delivered" status emails.
//
// Pure and dependency-free (no Deno or Supabase imports) so it can be
// unit-tested under vitest (src/test/customer-status-email.test.ts) and used
// by the notify-customers edge function.
//
// Everything interpolated is escaped. The operator's brand colour and logo
// are only used when they're a plain #hex colour and an https URL, so a bad
// value in organisations can't break or inject into the email.

export type StatusEvent = "collected" | "delivered";

export interface StatusEmailInput {
  event: StatusEvent;
  operator: {
    name: string;
    primaryColour?: string | null;
    logoUrl?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
  };
  clientName?: string | null;
  job: {
    reg: string;
    make?: string | null;
    model?: string | null;
    ref?: string | null;
    fromPlace?: string | null;
    toPlace?: string | null;
  };
  /** When the inspection was done (ISO). */
  at?: string | null;
  /** Delivery only: who signed for the vehicle. */
  receivedBy?: string | null;
  /** Link to the move in the client portal; omitted when unknown. */
  portalUrl?: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const DEFAULT_COLOUR = "#111827";

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeColour(c: string | null | undefined): string {
  return c && /^#[0-9a-f]{6}$/i.test(c.trim()) ? c.trim() : DEFAULT_COLOUR;
}

export function safeHttpsUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u.trim());
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** A portal link may be http on localhost for development; anything else must be https. */
export function safePortalUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u.trim());
    if (parsed.protocol === "https:") return parsed.toString();
    if (parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function formatUkDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function vehicleLine(job: StatusEmailInput["job"]): string {
  const mm = [job.make, job.model].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return mm ? `${job.reg} (${mm})` : job.reg;
}

export function renderStatusEmail(input: StatusEmailInput): RenderedEmail {
  const operator = (input.operator.name || "").trim() || "Your vehicle logistics provider";
  const reg = (input.job.reg || "").trim().toUpperCase() || "your vehicle";
  const job = { ...input.job, reg };
  const colour = safeColour(input.operator.primaryColour);
  const logo = safeHttpsUrl(input.operator.logoUrl);
  const portalUrl = safePortalUrl(input.portalUrl);
  const when = formatUkDateTime(input.at);
  const isDelivered = input.event === "delivered";

  const subject = isDelivered
    ? `Delivered: ${reg} has arrived`
    : `Collected: ${reg} is on its way`;
  const headline = isDelivered ? "Your vehicle has been delivered" : "Your vehicle has been collected";
  const lead = isDelivered
    ? `${operator} has delivered ${vehicleLine(job)}.`
    : `${operator} has collected ${vehicleLine(job)} and it's on its way.`;
  const button = isDelivered ? "View delivery report and photos" : "Track this move";

  const rows: [string, string][] = [];
  if (job.ref) rows.push(["Reference", job.ref]);
  if (job.fromPlace || job.toPlace) rows.push(["Route", `${job.fromPlace || "—"} → ${job.toPlace || "—"}`]);
  if (when) rows.push([isDelivered ? "Delivered" : "Collected", when]);
  if (isDelivered && input.receivedBy?.trim()) rows.push(["Received by", input.receivedBy.trim()]);

  const contactBits = [input.operator.contactPhone, input.operator.contactEmail]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  const greeting = input.clientName?.trim() ? `Hello ${input.clientName.trim()},` : "Hello,";

  // ── Plain text ──
  const text = [
    greeting,
    "",
    lead,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(portalUrl ? ["", `${button}: ${portalUrl}`] : []),
    "",
    contactBits.length ? `Questions? Contact ${operator}: ${contactBits.join(" · ")}` : `Thank you,\n${operator}`,
    "",
    `You're receiving this because you have access to ${operator}'s customer portal.`,
  ].join("\n");

  // ── HTML ──
  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:120px;vertical-align:top;">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const header = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(operator)}" style="max-height:40px;max-width:200px;display:block;">`
    : `<span style="color:#ffffff;font-size:18px;font-weight:bold;">${escapeHtml(operator)}</span>`;
  const buttonHtml = portalUrl
    ? `<p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(portalUrl)}" style="background:${colour};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block;">${escapeHtml(button)}</a></p>`
    : "";
  const contactHtml = contactBits.length
    ? `<p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Questions? Contact ${escapeHtml(operator)}: ${contactBits.map(escapeHtml).join(" · ")}</p>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr><td style="background:${logo ? "#ffffff" : colour};padding:20px 32px;border-bottom:3px solid ${colour};">${header}</td></tr>
          <tr><td style="padding:28px 32px;color:#1f2937;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 4px;font-size:20px;font-weight:bold;color:#111827;">${escapeHtml(headline)}</p>
            <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 16px;">${escapeHtml(lead)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin:8px 0;">
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:120px;">Vehicle</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:bold;">${escapeHtml(vehicleLine(job))}</td></tr>
              ${rowsHtml}
            </table>
            ${buttonHtml}
            ${contactHtml}
          </td></tr>
          <tr><td style="padding:16px 32px;background:#f9fafb;color:#9ca3af;font-size:12px;">
            You're receiving this because you have access to ${escapeHtml(operator)}'s customer portal.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Unique, valid, lower-cased recipient addresses. */
export function cleanRecipients(emails: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    const v = (e ?? "").trim().toLowerCase();
    if (EMAIL_RE.test(v)) out.add(v);
  }
  return [...out];
}

const DELIVERED_STATUSES = ["delivery_complete", "pod_ready", "completed"];

/**
 * Whether a queued notification should still go out, given the job as it is
 * now. A "collected" email that is only being processed after the vehicle
 * was delivered is superseded (the "delivered" one will go instead).
 */
export function skipReasonFor(
  event: StatusEvent,
  job: { status: string | null; client_id: string | null; is_hidden?: boolean | null } | null,
  queuedClientId: string,
): string | null {
  if (!job) return "job_missing";
  if (job.is_hidden) return "job_hidden";
  if (job.client_id !== queuedClientId) return "client_changed";
  if (job.status === "cancelled" || job.status === "failed") return "job_cancelled";
  if (event === "collected" && job.status && DELIVERED_STATUSES.includes(job.status)) return "superseded_by_delivery";
  return null;
}
