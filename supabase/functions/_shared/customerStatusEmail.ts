import { emailBrandColour, renderEmailBrandHeader } from "./emailBrand.ts";

// Customer-facing "collected" / "delivered" status emails, and the "aborted" notice an
// admin sends on purpose (never automatic; see notify_customer_job_aborted()).
//
// Pure and dependency-free (no Deno or Supabase imports) so it can be
// unit-tested under vitest (src/test/customer-status-email.test.ts) and used
// by the notify-customers edge function.
//
// Everything interpolated is escaped. The operator's brand colour and logo
// are only used when they're a plain #hex colour and an https URL, so a bad
// value in organisations can't break or inject into the email.

export type StatusEvent = "collected" | "delivered" | "aborted";

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
  /** When the inspection was done (ISO); for "aborted", when the Abort was confirmed. */
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
  const colour = emailBrandColour(operator, input.operator.primaryColour);
  const logo = safeHttpsUrl(input.operator.logoUrl);
  const portalUrl = safePortalUrl(input.portalUrl);
  const when = formatUkDateTime(input.at);
  const isDelivered = input.event === "delivered";
  const isAborted = input.event === "aborted";

  // The aborted notice says only that the collection did not go ahead: no reasons, no names,
  // no fees (those are internal to the operator).
  const subject = isAborted
    ? `Collection aborted: ${reg}`
    : isDelivered
      ? `Delivered: ${reg} has arrived`
      : `Collected: ${reg} is on its way`;
  const headline = isAborted
    ? "Collection aborted"
    : isDelivered ? "Your vehicle has been delivered" : "Your vehicle has been collected";
  const lead = isAborted
    ? `${operator} could not collect ${vehicleLine(job)} as planned, so this move has been aborted. The vehicle was not collected.`
    : isDelivered
      ? `${operator} has delivered ${vehicleLine(job)}.`
      : `${operator} has collected ${vehicleLine(job)} and it's on its way.`;
  const button = isAborted ? "View this move" : isDelivered ? "View delivery report and photos" : "Track this move";

  const rows: [string, string][] = [];
  if (job.ref) rows.push(["Reference", job.ref]);
  if (job.fromPlace || job.toPlace) rows.push(["Route", `${job.fromPlace || "—"} → ${job.toPlace || "—"}`]);
  if (when) rows.push([isAborted ? "Aborted" : isDelivered ? "Delivered" : "Collected", when]);
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
        `<tr><td style="padding:6px 0;color:#576B85;font-size:14px;width:120px;vertical-align:top;">${escapeHtml(k)}</td>` +
        `<td style="padding:6px 0;color:#111827;font-size:14px;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const buttonHtml = portalUrl
    ? `<p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(portalUrl)}" style="background:${colour};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold;display:inline-block;">${escapeHtml(button)}</a></p>`
    : "";
  const contactHtml = contactBits.length
    ? `<p style="margin:16px 0 0;color:#576B85;font-size:13px;">Questions? Contact ${escapeHtml(operator)}: ${contactBits.map(escapeHtml).join(" · ")}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
  <body style="margin:0;padding:0;background:#F4F7FA;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FA;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
          ${renderEmailBrandHeader(operator, logo)}
          <tr><td style="padding:24px 32px;color:#172F52;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 4px;font-size:20px;font-weight:bold;color:#111827;">${escapeHtml(headline)}</p>
            <p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 16px;">${escapeHtml(lead)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #D4E2F0;border-bottom:1px solid #D4E2F0;margin:8px 0;">
              <tr><td style="padding:6px 0;color:#576B85;font-size:14px;width:120px;">Vehicle</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:bold;">${escapeHtml(vehicleLine(job))}</td></tr>
              ${rowsHtml}
            </table>
            ${buttonHtml}
            ${contactHtml}
          </td></tr>
          <tr><td style="padding:16px 32px;background:#f9fafb;color:#576B85;font-size:12px;">
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
  job: { status: string | null; client_id: string | null; is_hidden?: boolean | null; is_test?: boolean | null } | null,
  queuedClientId: string,
): string | null {
  if (!job) return "job_missing";
  if (job.is_hidden) return "job_hidden";
  // Test data never reaches a customer (the service role bypasses the RLS that silences it in the app).
  if (job.is_test) return "job_test";
  if (job.client_id !== queuedClientId) return "client_changed";
  if (job.status === "cancelled" || job.status === "failed") return "job_cancelled";
  // An Abort notice is only true while the job is still aborted (it may have been reopened).
  if (event === "aborted") return job.status === "aborted" ? null : "job_not_aborted";
  if (job.status === "aborted") return "job_aborted";
  if (event === "collected" && job.status && DELIVERED_STATUSES.includes(job.status)) return "superseded_by_delivery";
  return null;
}
