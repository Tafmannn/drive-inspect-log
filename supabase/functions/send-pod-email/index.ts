import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(opts: {
  jobRef: string;
  vehicleReg: string;
  pickupCity: string;
  deliveryCity: string;
  dateStr: string;
  downloadUrl: string;
}): string {
  const { jobRef, vehicleReg, pickupCity, deliveryCity, dateStr, downloadUrl } = opts;
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
                  <a href="${downloadUrl}"
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
    // ─── Auth: requires a real signed-in user (this sends email on the
    // org's behalf, never a public/anon action). Uses getClaims — getUser()
    // stopped validating correctly under the newer signing-keys JWT setup.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const fromAddress = Deno.env.get("POD_EMAIL_FROM") || "Axentra Vehicle Logistics <onboarding@resend.dev>";

    const body = await req.json();
    const { to, jobRef, vehicleReg, pickupCity, deliveryCity, dateStr, downloadUrl } = body ?? {};

    if (!to || typeof to !== "string" || !EMAIL_RE.test(to)) {
      return new Response(
        JSON.stringify({ error: "Valid recipient 'to' email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!downloadUrl || typeof downloadUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "downloadUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subject = `Axentra POD – ${jobRef ?? ""} – ${vehicleReg ?? ""}`.trim();
    const html = renderHtml({
      jobRef: String(jobRef ?? ""),
      vehicleReg: String(vehicleReg ?? ""),
      pickupCity: String(pickupCity ?? "Unknown"),
      deliveryCity: String(deliveryCity ?? "Unknown"),
      dateStr: String(dateStr ?? ""),
      downloadUrl: String(downloadUrl),
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
