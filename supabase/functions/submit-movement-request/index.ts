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

// Cost/abuse guard: generous for a genuine visitor, tight enough to stop a flood.
const rateLimiter = createIpRateLimiter(corsHeaders, { maxPerWindow: 8, windowMs: 60_000 });

const CUSTOMER_TYPES = ["dealership", "dealer_group", "fleet", "rental", "leasing", "auction", "trade", "private", "other"];
const RUNNING = ["runs_and_drives", "starts_uncertain", "non_running", "unknown"];
const ROADWORTHY = ["yes", "no", "unsure"];
const MOT = ["valid", "expired", "unknown", "not_applicable"];
const ARRANGEMENT = ["confirmed", "needs_discussion", "unknown"];
const FREQUENCY = ["one_off", "recurring"];

const enumOrNull = (v: unknown, allowed: string[]): string | null =>
  typeof v === "string" && allowed.includes(v) ? v : null;

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

  // Honeypot: bots fill hidden fields. Pretend success without storing/emailing.
  if (typeof body.companyWebsite === "string" && body.companyWebsite.trim() !== "") {
    return jsonRes({ reference: createEnquiryReference() }, 200);
  }

  // ── Server-side validation (never trust the client) ──
  const fullName = cleanStr(body.fullName, 200);
  const email = isEmail(body.email) ? (body.email as string).trim() : null;
  const telephone = cleanStr(body.telephone, 40);
  const collectionContact = cleanStr(body.collectionContactName, 200);
  const deliveryContact = cleanStr(body.deliveryContactName, 200);
  const collectionPostcode = cleanStr(body.collectionPostcode, 12);
  const deliveryPostcode = cleanStr(body.deliveryPostcode, 12);

  const consentOk =
    body.consentAccurate === true &&
    body.consentNotBooking === true &&
    body.consentContact === true &&
    body.consentPrivacy === true;

  if (!fullName || !email || !telephone || !collectionContact || !deliveryContact || !collectionPostcode || !deliveryPostcode || !consentOk) {
    return jsonRes({ error: "VALIDATION_FAILED" }, 422);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonRes({ error: "SERVER_MISCONFIGURED" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const idempotencyKey = cleanStr(body.idempotencyKey, 64);

  // Idempotency: a repeated submit (double-click, retry) returns the SAME row.
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from("movement_enquiries")
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
    company_name: cleanStr(body.companyName, 200),
    email,
    telephone,
    customer_type: enumOrNull(body.customerType, CUSTOMER_TYPES),
    vehicle_registration: cleanStr(body.vehicleRegistration, 12),
    vehicle_make: cleanStr(body.vehicleMake, 60),
    vehicle_model: cleanStr(body.vehicleModel, 60),
    running_status: enumOrNull(body.runningStatus, RUNNING),
    roadworthy_status: enumOrNull(body.roadworthy, ROADWORTHY),
    mot_status: enumOrNull(body.motStatus, MOT),
    movement_arrangement: enumOrNull(body.movementArrangement, ARRANGEMENT),
    known_damage: cleanStr(body.knownDamage, 1000),
    collection_postcode: collectionPostcode,
    collection_contact_name: collectionContact,
    collection_instructions: cleanStr(body.collectionInstructions, 1000),
    delivery_postcode: deliveryPostcode,
    delivery_contact_name: deliveryContact,
    delivery_instructions: cleanStr(body.deliveryInstructions, 1000),
    preferred_date: cleanStr(body.preferredDate, 40),
    date_flexible: body.dateFlexible === true,
    movement_frequency: enumOrNull(body.frequency, FREQUENCY),
    additional_instructions: cleanStr(body.additionalInstructions, 2000),
  };

  const { error: insertErr } = await supabase.from("movement_enquiries").insert(row);
  if (insertErr) {
    // Unique violation on idempotency_key = concurrent duplicate; resolve to same ref.
    if (insertErr.code === "23505" && idempotencyKey) {
      const { data: existing } = await supabase
        .from("movement_enquiries")
        .select("public_reference")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing?.public_reference) return jsonRes({ reference: existing.public_reference }, 200);
    }
    console.error("movement_enquiries insert failed", insertErr.code);
    return jsonRes({ error: "STORE_FAILED" }, 500);
  }

  // ── Emails (best-effort; never block the acknowledgement) ──
  const notifyTo = internalNotifyAddress();
  if (notifyTo) {
    await sendResendEmail({
      to: notifyTo,
      replyTo: email,
      subject: `New Axentra movement request — ${reference}`,
      html: internalHtml(reference, row),
    });
  }
  await sendResendEmail({
    to: email,
    subject: `We received your Axentra movement request — ${reference}`,
    html: customerHtml(reference, fullName),
  });

  return jsonRes({ reference }, 200);
});

function internalHtml(reference: string, row: Record<string, unknown>): string {
  const line = (label: string, value: unknown) =>
    value ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">${escapeHtml(label)}</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(String(value))}</td></tr>` : "";
  return `<div style="font-family:Arial,sans-serif;color:#0f172a;">
    <h2>New movement request</h2>
    <p><strong>Reference:</strong> ${escapeHtml(reference)}</p>
    <table style="border-collapse:collapse;font-size:14px;">
      ${line("Name", row.full_name)}
      ${line("Company", row.company_name)}
      ${line("Email", row.email)}
      ${line("Telephone", row.telephone)}
      ${line("Customer type", row.customer_type)}
      ${line("Registration", row.vehicle_registration)}
      ${line("Vehicle", [row.vehicle_make, row.vehicle_model].filter(Boolean).join(" "))}
      ${line("Running", row.running_status)}
      ${line("Roadworthy", row.roadworthy_status)}
      ${line("Collection", row.collection_postcode)}
      ${line("Delivery", row.delivery_postcode)}
      ${line("Preferred date", row.preferred_date)}
      ${line("Frequency", row.movement_frequency)}
      ${line("Instructions", row.additional_instructions)}
    </table>
  </div>`;
}

function customerHtml(reference: string, name: string): string {
  return `<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:520px;">
    <div style="background:#0b1c3f;padding:20px 24px;color:#fff;font-size:18px;font-weight:bold;">Axentra Vehicle Logistics</div>
    <div style="padding:24px;font-size:15px;line-height:1.6;">
      <p>Dear ${escapeHtml(name)},</p>
      <p>Thank you — we have received your movement request.</p>
      <p><strong>Reference:</strong> ${escapeHtml(reference)}</p>
      <p><strong>This is not yet a confirmed booking.</strong> Axentra will review the vehicle,
      route, date and service requirements before responding with availability and pricing.</p>
      <p>If any details are incorrect, simply reply to this email with the correction.</p>
      <p style="color:#64748b;font-size:13px;">Driven vehicle movement services across the UK.</p>
    </div>
  </div>`;
}
