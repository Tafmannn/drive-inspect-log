import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateCaller, corsHeaders } from "../_shared/auth.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Only http(s) links belong in the "Download Invoice" button. Reject anything
// else (javascript:, data:, etc.) so a malformed/hostile downloadUrl can never
// become a live link, and attribute-escape it like every other interpolation.
function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return escapeHtml(url);
  } catch {
    return null;
  }
}

function fmtGbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

function renderHtml(opts: {
  invoiceNumber: string;
  clientName: string;
  total: number | null;
  issueDate: string;
  dueDate: string | null;
  downloadHref: string;
}): string {
  const { invoiceNumber, clientName, total, issueDate, dueDate, downloadHref } = opts;
  const dueLine = dueDate
    ? `<p style="margin:0 0 4px;"><strong>Due date:</strong> ${escapeHtml(dueDate)}</p>`
    : "";
  const totalLine = total != null
    ? `<p style="margin:0 0 24px;"><strong>Amount due:</strong> ${escapeHtml(fmtGbp(total))}</p>`
    : `<p style="margin:0 0 24px;"></p>`;
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
                <p style="margin:0 0 16px;">Dear ${escapeHtml(clientName || "Customer")},</p>
                <p style="margin:0 0 16px;">
                  Please find your invoice <strong>${escapeHtml(invoiceNumber)}</strong> below.
                </p>
                <p style="margin:0 0 4px;"><strong>Invoice date:</strong> ${escapeHtml(issueDate)}</p>
                ${dueLine}
                ${totalLine}
                <p style="margin:0 0 24px;text-align:center;">
                  <a href="${downloadHref}"
                     style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;display:inline-block;">
                    Download Invoice
                  </a>
                </p>
                <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">Link expires in 30 days.</p>
                <p style="margin:0 0 16px;">Payment details are shown on the invoice. Please use the invoice number as your payment reference.</p>
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateCaller(req);
    if ("error" in authResult) return authResult.error;
    const { caller, admin } = authResult;

    // ─── Invoicing is an admin capability throughout the app (all invoice
    // screens are admin-routed and invoices RLS is admin-only for writes).
    // Requiring admin here is also what makes the free-recipient rule below
    // safe: unlike send-pod-email, whose callers include drivers and which
    // therefore pins recipients to on-file contacts, this function trusts
    // the org's admins to direct their own invoices — the confirm dialog in
    // the UI is the safeguard against typos.
    if (!caller.isAdmin && !caller.isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const fromAddress =
      Deno.env.get("INVOICE_EMAIL_FROM") ||
      Deno.env.get("POD_EMAIL_FROM") ||
      "Axentra Vehicle Logistics <onboarding@resend.dev>";

    const body = await req.json();
    const { to, invoiceId, downloadUrl } = body ?? {};

    if (!to || typeof to !== "string" || !EMAIL_RE.test(to)) {
      return new Response(
        JSON.stringify({ error: "Valid recipient 'to' email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!invoiceId || typeof invoiceId !== "string") {
      return new Response(
        JSON.stringify({ error: "invoiceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const downloadHref = typeof downloadUrl === "string" ? safeHref(downloadUrl) : null;
    if (!downloadHref) {
      return new Response(
        JSON.stringify({ error: "A valid http(s) downloadUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── The invoice itself is the authority for what gets sent: number,
    // client, totals all come from the stored row, never from the request —
    // a caller can't spoof another org's invoice or inflate the figures in
    // the email. Org ownership is enforced the same way as send-pod-email.
    const { data: invoice } = await admin
      .from("invoices")
      .select("org_id, invoice_number, client_name, total, issue_date, due_date, created_at")
      .eq("id", invoiceId)
      .maybeSingle();

    if (!invoice || (!caller.isSuperAdmin && invoice.org_id !== caller.orgId)) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const issueDate = String(invoice.issue_date ?? invoice.created_at ?? "").slice(0, 10);
    const subject = `Axentra Invoice ${invoice.invoice_number}`;
    const html = renderHtml({
      invoiceNumber: String(invoice.invoice_number ?? ""),
      clientName: String(invoice.client_name ?? ""),
      total: invoice.total != null ? Number(invoice.total) : null,
      issueDate,
      dueDate: invoice.due_date ? String(invoice.due_date).slice(0, 10) : null,
      downloadHref,
    });

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
      }),
    });

    const resendData = await resendResp.json().catch(() => ({}));

    if (!resendResp.ok) {
      return new Response(
        JSON.stringify({ error: "EMAIL_SEND_FAILED", detail: resendData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ sent: true, id: resendData?.id ?? null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
