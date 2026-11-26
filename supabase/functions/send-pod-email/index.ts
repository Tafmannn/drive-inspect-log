// send-pod-email — emails a branded Proof of Delivery to the customer, or,
// with kind: "collection", a Proof of Collection. Always sent by hand from
// the POD page after the sender confirms the recipient.
//
// What the email says comes from the database (job, delivery inspection,
// organisation branding), never from the request: the request only names
// the job, the recipient and the two signed download links, and those links
// must be signed URLs from this project's own pod-pdfs / pod-photos storage.
//
// Recipient rules (see _shared/podEmail.ts decidePodRecipient):
//   admins — any address (they confirm it in the app);
//   drivers — an email on file for the job or its client, or, when nothing
//   is on file, the address they enter, which is then saved to the job.
// Every send is recorded in job_activity_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateCaller, corsHeaders, jsonRes } from "../_shared/auth.ts";
import { cleanRecipients } from "../_shared/customerStatusEmail.ts";
import {
  decidePodRecipient,
  isOwnSignedStorageUrl,
  renderPodEmail,
  resolveEmailLogoUrl,
} from "../_shared/podEmail.ts";
import { pickAppOrigin } from "../_shared/appOrigin.ts";
import { emailDeliveryGate } from "../_shared/deliveryGuard.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(status: number, error: string, message: string): Response {
  return jsonRes({ error, message }, status);
}

function appBaseUrl(req: Request): string | null {
  return pickAppOrigin(Deno.env.get("APP_URL"), Deno.env.get("APP_ALLOWED_ORIGINS"), req.headers.get("origin"));
}

function place(city: string | null, postcode: string | null): string | null {
  const s = [city, postcode].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
  return s || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticateCaller(req);
    if ("error" in auth) return auth.error;
    const { caller, admin } = auth;
    if (caller.accountStatus !== "active" || (!caller.isSuperAdmin && !caller.orgId)) {
      return fail(403, "FORBIDDEN", "Your account can't send emails.");
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return fail(500, "EMAIL_NOT_CONFIGURED", "Email sending isn't set up yet.");
    }
    const fromAddress = Deno.env.get("POD_EMAIL_FROM") || "Axentra Vehicle Logistics <onboarding@resend.dev>";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

    const body = await req.json().catch(() => null);
    const { to, jobId, downloadUrl, photosZipUrl } = body ?? {};
    const isCollection = body?.kind === "collection";
    const short = isCollection ? "Proof of Collection" : "POD";

    if (typeof to !== "string" || !EMAIL_RE.test(to.trim())) {
      return fail(400, "INVALID_RECIPIENT", "Enter a valid email address.");
    }
    const recipient = to.trim().toLowerCase();
    if (typeof jobId !== "string" || !jobId) return fail(400, "JOB_REQUIRED", "Missing job.");
    if (!isOwnSignedStorageUrl(downloadUrl, supabaseUrl, "pod-pdfs")) {
      return fail(400, "INVALID_POD_LINK", `The ${short} download link is invalid. Please try again.`);
    }
    // Optional: drop the photos link rather than fail if it isn't ours.
    const photosUrl =
      !isCollection && isOwnSignedStorageUrl(photosZipUrl, supabaseUrl, "pod-photos") ? (photosZipUrl as string) : null;

    const { data: job } = await admin
      .from("jobs")
      .select(
        "id, org_id, client_id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, pickup_city, pickup_postcode, delivery_city, delivery_postcode, delivery_contact_name, delivery_contact_email, pickup_contact_name, pickup_contact_email, completed_at",
      )
      .eq("id", jobId)
      .maybeSingle();
    if (!job || (!caller.isSuperAdmin && job.org_id !== caller.orgId)) {
      return fail(403, "FORBIDDEN", `You can't send a ${short} for this job.`);
    }

    const { data: client } = job.client_id
      ? await admin
          .from("clients")
          .select("name, company, trading_name, email, billing_email, contact_email, contact_name")
          .eq("id", job.client_id)
          .maybeSingle()
      : { data: null };

    const decision = decidePodRecipient({
      isAdmin: caller.isAdmin || caller.isSuperAdmin,
      to: recipient,
      jobEmails: isCollection
        ? [job.pickup_contact_email, job.delivery_contact_email]
        : [job.delivery_contact_email, job.pickup_contact_email],
      clientEmails: [client?.email, client?.billing_email, client?.contact_email],
    });
    if (!decision.allowed) {
      return jsonRes(
        {
          error: "RECIPIENT_NOT_ON_FILE",
          message:
            `This job's customer email is ${decision.onFile.join(" or ")}. ` +
            "Send it there, or ask an admin to send it to a different address.",
          onFile: decision.onFile,
        },
        403,
      );
    }

    const [{ data: org }, { data: stageInspection }] = await Promise.all([
      admin
        .from("organisations")
        .select("name, branding_name, logo_url, primary_colour, main_contact_email, main_contact_phone, trading_address")
        .eq("id", job.org_id)
        .maybeSingle(),
      admin
        .from("inspections")
        .select("inspected_at, customer_name")
        .eq("job_id", job.id)
        .eq("type", isCollection ? "pickup" : "delivery")
        .is("archived_at", null)
        .order("inspected_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (isCollection && !stageInspection) {
      return fail(409, "NOT_COLLECTED", "This vehicle hasn't been collected yet, so there's no Proof of Collection to send.");
    }

    const ref = (job.external_job_number ?? "").trim() || String(job.id).slice(0, 8).toUpperCase();
    const operatorName = (org?.branding_name || org?.name || "").trim();
    const contactEmail = isCollection ? job.pickup_contact_email : job.delivery_contact_email;
    const contactName = isCollection ? job.pickup_contact_name : job.delivery_contact_name;
    const email = renderPodEmail({
      kind: isCollection ? "collection" : "delivery",
      operator: {
        name: operatorName,
        logoUrl: resolveEmailLogoUrl(org?.logo_url, appBaseUrl(req)),
        primaryColour: org?.primary_colour,
        contactEmail: org?.main_contact_email,
        contactPhone: org?.main_contact_phone,
        address: org?.trading_address,
      },
      recipientName:
        (contactEmail ?? "").trim().toLowerCase() === recipient
          ? contactName
          : client?.contact_name || client?.trading_name || client?.company || null,
      job: {
        ref,
        reg: job.vehicle_reg ?? "",
        make: job.vehicle_make,
        model: job.vehicle_model,
        from: place(job.pickup_city, job.pickup_postcode),
        to: place(job.delivery_city, job.delivery_postcode),
      },
      deliveredAt: stageInspection?.inspected_at ?? (isCollection ? null : job.completed_at),
      receivedBy: stageInspection?.customer_name,
      podUrl: downloadUrl as string,
      photosUrl,
    });

    const replyTo = cleanRecipients([org?.main_contact_email])[0];
    const gate = emailDeliveryGate(recipient);
    if (!gate.send) {
      return jsonRes({ error: "EMAIL_SUPPRESSED", message: "Email delivery is disabled for this recipient in this environment.", detail: gate.reason }, 409);
    }
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    const resendData = await resendResp.json().catch(() => ({}));
    if (!resendResp.ok) {
      console.error("send-pod-email: Resend rejected", resendResp.status, JSON.stringify(resendData).slice(0, 500));
      return jsonRes(
        {
          error: "EMAIL_SEND_FAILED",
          message: "The email service didn't accept the message. Please try again in a moment.",
        },
        502,
      );
    }

    // Record it; save a driver/admin-entered address when the job had none.
    // Best-effort: the email has already gone.
    try {
      if (decision.saveToJob) {
        const column = isCollection ? "pickup_contact_email" : "delivery_contact_email";
        await admin
          .from("jobs")
          .update({ [column]: recipient })
          .eq("id", job.id)
          .or(`${column}.is.null,${column}.eq.""`);
      }
      await admin.from("job_activity_log").insert({
        job_id: job.id,
        org_id: job.org_id,
        action: isCollection ? "poc_emailed" : "pod_emailed",
        notes: `${short} emailed to ${recipient} by ${caller.email || caller.id}${decision.saveToJob ? " (address saved to job)" : ""}`,
      });
    } catch (e) {
      console.error("send-pod-email: post-send bookkeeping failed", e instanceof Error ? e.message : e);
    }

    return jsonRes({ sent: true, id: resendData?.id ?? null, recipient });
  } catch (e) {
    console.error("send-pod-email error:", e instanceof Error ? e.message : e);
    return fail(500, "INTERNAL", "Something went wrong sending the email. Please try again.");
  }
});
