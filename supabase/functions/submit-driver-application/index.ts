import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonRes } from "../_shared/auth.ts";
import { createIpRateLimiter } from "../_shared/rateLimit.ts";
import {
  createEnquiryReference,
  cleanStr,
  escapeHtml,
  isEmail,
  sendResendEmail,
  internalNotifyAddress,
} from "../_shared/enquiryUtils.ts";

const rateLimiter = createIpRateLimiter(corsHeaders, { maxPerWindow: 6, windowMs: 60_000 });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "METHOD_NOT_ALLOWED" }, 405);

  const limited = rateLimiter.check(req);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "INVALID_JSON" }, 400);
  }

  if (typeof body.companyWebsite === "string" && body.companyWebsite.trim() !== "") {
    return jsonRes({ reference: createEnquiryReference() }, 200);
  }

  const fullName = cleanStr(body.fullName, 200);
  const email = isEmail(body.email) ? (body.email as string).trim() : null;
  const telephone = cleanStr(body.telephone, 40);
  const postcode = cleanStr(body.postcode, 12);
  const consentOk =
    body.licenceHeld === true &&
    body.hasSmartphone === true &&
    body.consentContact === true &&
    body.consentPrivacy === true;

  if (!fullName || !email || !telephone || !postcode || !consentOk) {
    return jsonRes({ error: "VALIDATION_FAILED" }, 422);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonRes({ error: "SERVER_MISCONFIGURED" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const idempotencyKey = cleanStr(body.idempotencyKey, 64);
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("driver_applications")
      .select("public_reference")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing?.public_reference) {
      return jsonRes({ reference: existing.public_reference }, 200);
    }
  }

  const reference = createEnquiryReference();

  const row = {
    public_reference: reference,
    idempotency_key: idempotencyKey,
    full_name: fullName,
    email,
    telephone,
    postcode,
    years_driving: cleanStr(body.yearsDriving, 20),
    experience: cleanStr(body.experience, 2000),
    availability: cleanStr(body.availability, 200),
  };

  const { error: insertErr } = await supabase.from("driver_applications").insert(row);
  if (insertErr) {
    if (insertErr.code === "23505" && idempotencyKey) {
      const { data: existing } = await supabase
        .from("driver_applications")
        .select("public_reference")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing?.public_reference) return jsonRes({ reference: existing.public_reference }, 200);
    }
    console.error("driver_applications insert failed", insertErr.code);
    return jsonRes({ error: "STORE_FAILED" }, 500);
  }

  const notifyTo = internalNotifyAddress();
  if (notifyTo) {
    await sendResendEmail({
      to: notifyTo,
      replyTo: email,
      subject: `New Axentra driver application — ${reference}`,
      html: `<div style="font-family:Arial,sans-serif;color:#0f172a;">
        <h2>New driver application</h2>
        <p><strong>Reference:</strong> ${escapeHtml(reference)}</p>
        <p><strong>Name:</strong> ${escapeHtml(fullName)}<br/>
        <strong>Email:</strong> ${escapeHtml(email)}<br/>
        <strong>Telephone:</strong> ${escapeHtml(telephone)}<br/>
        <strong>Postcode:</strong> ${escapeHtml(postcode)}<br/>
        <strong>Years driving:</strong> ${escapeHtml(String(row.years_driving ?? ""))}<br/>
        <strong>Availability:</strong> ${escapeHtml(String(row.availability ?? ""))}</p>
        <p><strong>Experience:</strong><br/>${escapeHtml(String(row.experience ?? ""))}</p>
      </div>`,
    });
  }
  await sendResendEmail({
    to: email,
    subject: `We received your Axentra driver application — ${reference}`,
    html: `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:520px;">
      <div style="background:#0b1c3f;padding:20px 24px;color:#fff;font-size:18px;font-weight:bold;">Axentra Vehicle Logistics</div>
      <div style="padding:24px;font-size:15px;line-height:1.6;">
        <p>Dear ${escapeHtml(fullName)},</p>
        <p>Thank you for your interest in driving with Axentra. Your application has been received for review.</p>
        <p><strong>Reference:</strong> ${escapeHtml(reference)}</p>
        <p>Submission does not guarantee approval or access to work. We will be in touch if there is a suitable opportunity.</p>
      </div>
    </div>`,
  });

  return jsonRes({ reference }, 200);
});
