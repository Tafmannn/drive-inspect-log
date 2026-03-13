
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, jobRef, vehicleReg, route, date, downloadUrl } = await req.json();

    if (!to || !downloadUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, downloadUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#212529;padding:28px 32px;">
              <p style="margin:0;color:#ffffff;font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.7;">Axentra Vehicle Logistics</p>
              <p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:bold;">Proof of Delivery</p>
            </td>
          </tr>

          <!-- Job details -->
          <tr>
            <td style="padding:28px 32px 0;">
              <p style="margin:0 0 16px;color:#374151;font-size:15px;">Dear Customer,</p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                Your Proof of Delivery for job <strong>${jobRef}</strong> (${vehicleReg}) is ready to download.
              </p>

              <table cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:6px;padding:16px;width:100%;margin-bottom:28px;">
                <tr>
                  <td style="padding:4px 0;">
                    <span style="color:#6b7280;font-size:13px;">Job Reference</span>
                    <span style="float:right;color:#111827;font-size:13px;font-weight:600;">${jobRef}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 0;border-top:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-size:13px;">Vehicle</span>
                    <span style="float:right;color:#111827;font-size:13px;font-weight:600;">${vehicleReg}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 0;border-top:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-size:13px;">Route</span>
                    <span style="float:right;color:#111827;font-size:13px;font-weight:600;">${route}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 0;border-top:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-size:13px;">Date</span>
                    <span style="float:right;color:#111827;font-size:13px;font-weight:600;">${date}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Download button -->
          <tr>
            <td align="center" style="padding:0 32px 32px;">
              <a href="${downloadUrl}"
                style="display:inline-block;background:#212529;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 36px;border-radius:6px;letter-spacing:0.5px;">
                ⬇&nbsp;&nbsp;Download POD PDF
              </a>
              <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;">Link expires in 30 days</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
                If you have any queries, please contact us at
                <a href="mailto:info@axentravehicles.com" style="color:#374151;">info@axentravehicles.com</a>
              </p>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:11px;">
                Axentra Vehicle Logistics &bull; This email was sent automatically
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Axentra <noreply@axentravehicles.com>",
        to: [to],
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
