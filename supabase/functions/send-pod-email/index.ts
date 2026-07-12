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

// Only http(s) links belong in the "Download POD" button. Reject anything else
// (javascript:, data:, etc.) so a malformed/hostile downloadUrl can never become
// a live link, and attribute-escape the value like every other interpolation.
function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return escapeHtml(url);
  } catch {
    return null;
  }
}

function renderHtml(opts: {
  jobRef: string;
  vehicleReg: string;
  pickupCity: string;
  deliveryCity: string;
  dateStr: string;
  downloadHref: string;
}): string {
  const { jobRef, vehicleReg, pickupCity, deliveryCity, dateStr, downloadHref } = opts;
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
                <p style="margin:0 0 16px;">Dear Customer,</p>
                <p style="margin:0 0 16px;">
                  Please find your Proof of Delivery for job <strong>${escapeHtml(jobRef)}</strong>
                  (${escapeHtml(vehicleReg)}) below.
                </p>
                <p style="margin:0 0 4px;"><strong>Route:</strong> ${escapeHtml(pickupCity)} &rarr; ${escapeHtml(deliveryCity)}</p>
                <p style="margin:0 0 24px;"><strong>Date:</strong> ${escapeHtml(dateStr)}</p>
                <p style="margin:0 0 24px;text-align:center;">
                  <a href="${downloadHref}"
                     style="background:#111827;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;display:inline-block;">
                    Download POD
                  </a>
                </p>
                <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">This link expires in 30 days.</p>
                <p style="margin:0 0 16px;">If you have any queries, please do not hesitate to contact us.</p>
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
    // ─── Auth: requires a real signed-in user with a resolvable org (this
    // sends email — and reads job contact details — on the org's behalf,
    // never a public/anon action). Same authoritative caller/org resolution
    // as every other edge function, via _shared/auth.ts.
    const authResult = await authenticateCaller(req);
    if ("error" in authResult) return authResult.error;
    const { caller, admin } = authResult;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const fromAddress = Deno.env.get("POD_EMAIL_FROM") || "Axentra Vehicle Logistics <onboarding@resend.dev>";

    const body = await req.json();
    const { to, jobId, jobRef, vehicleReg, pickupCity, deliveryCity, dateStr, downloadUrl } = body ?? {};

    if (!to || typeof to !== "string" || !EMAIL_RE.test(to)) {
      return new Response(
        JSON.stringify({ error: "Valid recipient 'to' email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!jobId || typeof jobId !== "string") {
      return new Response(
        JSON.stringify({ error: "jobId is required" }),
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

    // ─── Authorization: this sends on the org's behalf via a shared sending
    // identity/reputation, so a caller must not be able to reach jobs outside
    // their own org, or redirect delivery to an address that isn't actually
    // on file for the job (an open relay via the org's Resend account).
    const { data: job } = await admin
      .from("jobs")
      .select("org_id, pickup_contact_email, delivery_contact_email")
      .eq("id", jobId)
      .maybeSingle();

    if (!job || (!caller.isSuperAdmin && job.org_id !== caller.orgId)) {
      return new Response(
        JSON.stringify({ error: "FORBIDDEN" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const onFileEmails = [job.pickup_contact_email, job.delivery_contact_email]
      .filter((e): e is string => typeof e === "string" && e.length > 0)
      .map((e) => e.toLowerCase());
    if (!onFileEmails.includes(to.toLowerCase())) {
      return new Response(
        JSON.stringify({ error: "Recipient must be a contact email on file for this job" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subject = `Axentra POD – ${jobRef ?? ""} – ${vehicleReg ?? ""}`.trim();
    const html = renderHtml({
      jobRef: String(jobRef ?? ""),
      vehicleReg: String(vehicleReg ?? ""),
      pickupCity: String(pickupCity ?? "Unknown"),
      deliveryCity: String(deliveryCity ?? "Unknown"),
      dateStr: String(dateStr ?? ""),
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
