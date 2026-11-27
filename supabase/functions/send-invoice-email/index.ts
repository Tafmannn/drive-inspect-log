import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateCaller, corsHeaders, inactiveAccountError } from "../_shared/auth.ts";
import { pickAppOrigin } from "../_shared/appOrigin.ts";
import { resolveLogoUrl } from "../_shared/podEmail.ts";
import { invoiceEmailSubject, renderInvoiceEmailHtml } from "../_shared/invoiceEmail.ts";
import { emailDeliveryGate } from "../_shared/deliveryGuard.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_COPY_RECIPIENTS = 10;

/**
 * Optional cc / bcc: absent, or an array of up to 10 valid addresses. Duplicates, the main
 * recipient, and (for bcc) anything already in cc are dropped. Returns null when invalid.
 */
function copyList(value: unknown, exclude: Set<string>): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_COPY_RECIPIENTS) return null;
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") return null;
    const a = v.trim();
    if (!EMAIL_RE.test(a)) return null;
    const key = a.toLowerCase();
    if (exclude.has(key)) continue;
    exclude.add(key);
    out.push(a);
  }
  return out;
}

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
    // Only active accounts: pending (not yet activated) and suspended are refused.
    const inactive = inactiveAccountError(caller.accountStatus);
    if (inactive || (!caller.isAdmin && !caller.isSuperAdmin)) {
      return new Response(
        JSON.stringify({ error: inactive ?? "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    if (body?.action === "invoice-pack-capability") {
      return new Response(JSON.stringify({ invoicePackVersion: 1 }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const { to, invoiceId, downloadUrl } = body ?? {};

    if (!to || typeof to !== "string" || !EMAIL_RE.test(to)) {
      return new Response(
        JSON.stringify({ error: "Valid recipient 'to' email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const seen = new Set<string>([to.trim().toLowerCase()]);
    const cc = copyList(body?.cc, seen);
    const bcc = copyList(body?.bcc, seen);
    if (!cc || !bcc) {
      return new Response(
        JSON.stringify({ error: `cc and bcc must each be up to ${MAX_COPY_RECIPIENTS} valid email addresses` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!invoiceId || typeof invoiceId !== "string") {
      return new Response(
        JSON.stringify({ error: "invoiceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    let downloadHref = typeof downloadUrl === "string" ? safeHref(downloadUrl) : null;
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
      .select("org_id, invoice_number, client_name, total, issue_date, due_date, created_at, pdf_url, document_type")
      .eq("id", invoiceId)
      .maybeSingle();

    if (!invoice || (!caller.isSuperAdmin && invoice.org_id !== caller.orgId)) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pack paths are bound to the database invoice. Never sign a client-supplied path.
    if (body.expectedPdfPath && body.expectedPdfPath !== invoice.pdf_url) {
      return new Response(JSON.stringify({ error: "INVOICE_CHANGED" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let packHref: string | undefined;
    if (typeof invoice.pdf_url === "string" && invoice.pdf_url.includes("/pack-v1-")) {
      const path = invoice.pdf_url;
      const parts = path.split("/");
      if (parts.length !== 4 || parts[0] !== String(invoice.org_id) || parts[1] !== `pack-v1-${invoiceId}` ||
          !/^[0-9a-f-]{36}$/i.test(parts[2]) || !/^AXENTRA_(?:INV|CN)_[A-Za-z0-9_-]+\.pdf$/.test(parts[3])) {
        return new Response(JSON.stringify({ error: "INVALID_INVOICE_PACK_PATH" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const ttl = 60 * 60 * 24 * 30;
      const [pdfLink, packLink] = await Promise.all([
        admin.storage.from("invoice-pdfs").createSignedUrl(path, ttl, { download: true }),
        admin.storage.from("invoice-pdfs").createSignedUrl(path.replace(/\.pdf$/, ".zip"), ttl, { download: true }),
      ]);
      const signedPdf = pdfLink.data?.signedUrl ? safeHref(pdfLink.data.signedUrl) : null;
      const signedPack = packLink.data?.signedUrl ? safeHref(packLink.data.signedUrl) : null;
      if (pdfLink.error || packLink.error || !signedPdf || !signedPack) {
        return new Response(JSON.stringify({ error: "INVOICE_PACK_UNAVAILABLE" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      downloadHref = signedPdf;
      packHref = signedPack;
    }
    const issueDate = String(invoice.issue_date ?? invoice.created_at ?? "").slice(0, 10);
    const subject = invoiceEmailSubject(String(invoice.invoice_number ?? ""), invoice.document_type);
    const html = renderInvoiceEmailHtml({
      logoUrl: resolveLogoUrl('/axentra-logo.png', pickAppOrigin(Deno.env.get('APP_URL'), Deno.env.get('APP_ALLOWED_ORIGINS'), req.headers.get('origin'))),
      invoiceNumber: String(invoice.invoice_number ?? ""),
      documentType: invoice.document_type,
      clientName: String(invoice.client_name ?? ""),
      total: invoice.total != null ? Number(invoice.total) : null,
      issueDate,
      dueDate: invoice.due_date ? String(invoice.due_date).slice(0, 10) : null,
      downloadHref,
      packHref,
    });

    // Every recipient, copies included, must pass the environment guard (staging never
    // e-mails a real customer through a cc / bcc).
    for (const recipient of [to, ...cc, ...bcc]) {
      const gate = emailDeliveryGate(recipient);
      if (!gate.send) {
        return new Response(
          JSON.stringify({ error: "EMAIL_SUPPRESSED", detail: gate.reason }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        ...(cc.length ? { cc } : {}),
        ...(bcc.length ? { bcc } : {}),
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

    // First successful send marks the invoice as issued — this is what makes
    // it visible in the client portal. Best-effort: the email has already
    // gone out, so a failure here must not turn the response into an error.
    try {
      await admin
        .from("invoices")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", invoiceId)
        .is("sent_at", null);
    } catch (e) {
      console.error("send-invoice-email: sent_at stamp failed", e instanceof Error ? e.message : e);
    }

    return new Response(
      JSON.stringify({ sent: true, id: resendData?.id ?? null, packIncluded: !!packHref }),
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
