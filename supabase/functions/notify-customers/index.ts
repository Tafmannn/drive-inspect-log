// notify-customers — sends queued "collected" / "delivered" emails.
//
// The queue (public.customer_notifications) is written by a database trigger
// on job status changes, so this function never decides WHAT to send from
// the request: it only drains rows the database queued. Any active staff
// member can kick it (the app does after each inspection submit, and on the
// admin overview as a safety net); it processes only the caller's org (super
// admins: all orgs). Safe to call repeatedly or concurrently: each row is
// claimed with a compare-and-set before sending.
//
// Recipients: the job's client's ACTIVE portal users only (people the
// operator explicitly invited). The client's status_emails_enabled switch,
// an archived client, a hidden/cancelled job or a client change all skip.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateCaller, corsHeaders, jsonRes } from "../_shared/auth.ts";
import {
  cleanRecipients,
  renderStatusEmail,
  skipReasonFor,
  type StatusEvent,
} from "../_shared/customerStatusEmail.ts";

const BATCH = 20;
const MAX_ATTEMPTS = 5;
const STALE_CLAIM_MS = 10 * 60 * 1000;

interface QueueRow {
  id: string;
  org_id: string;
  job_id: string;
  client_id: string;
  event: StatusEvent;
  status: string;
  attempts: number;
}

function appBaseUrl(req: Request): string | null {
  const candidate = Deno.env.get("APP_URL") || req.headers.get("origin") || "";
  try {
    const u = new URL(candidate);
    if (u.protocol === "https:") return u.origin;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return u.origin;
    return null;
  } catch {
    return null;
  }
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

    // Active staff only. Portal logins resolve to no org and are refused.
    if (caller.accountStatus !== "active" || (!caller.isSuperAdmin && !caller.orgId)) {
      return jsonRes({ error: "FORBIDDEN" }, 403);
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      // Leave everything queued; it goes out once email is configured.
      return jsonRes({ processed: 0, reason: "EMAIL_NOT_CONFIGURED" });
    }
    const fromAddress =
      Deno.env.get("CUSTOMER_EMAIL_FROM") ||
      Deno.env.get("POD_EMAIL_FROM") ||
      Deno.env.get("INVOICE_EMAIL_FROM") ||
      "Axentra Vehicle Logistics <onboarding@resend.dev>";
    const baseUrl = appBaseUrl(req);

    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    let q = admin
      .from("customer_notifications")
      .select("id, org_id, job_id, client_id, event, status, attempts")
      .or(
        `status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS}),and(status.eq.sending,claimed_at.lt."${staleBefore}")`,
      )
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (!caller.isSuperAdmin) q = q.eq("org_id", caller.orgId!);
    const { data: rows, error: loadErr } = await q;
    if (loadErr) return jsonRes({ error: "QUEUE_LOAD_FAILED" }, 500);

    const summary = { processed: 0, sent: 0, skipped: 0, failed: 0 };

    for (const row of (rows ?? []) as QueueRow[]) {
      // Claim (compare-and-set): only one caller gets each row.
      const { data: claimed } = await admin
        .from("customer_notifications")
        .update({ status: "sending", claimed_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq("id", row.id)
        .eq("status", row.status)
        .eq("attempts", row.attempts)
        .select("id");
      if (!claimed || claimed.length === 0) continue;
      summary.processed++;

      const finish = async (patch: Record<string, unknown>) => {
        await admin.from("customer_notifications").update(patch).eq("id", row.id);
      };

      try {
        const { data: job } = await admin
          .from("jobs")
          .select(
            "id, status, client_id, is_hidden, vehicle_reg, vehicle_make, vehicle_model, external_job_number, pickup_city, pickup_postcode, delivery_city, delivery_postcode",
          )
          .eq("id", row.job_id)
          .maybeSingle();

        const jobSkip = skipReasonFor(row.event, job, row.client_id);
        if (jobSkip) {
          await finish({ status: "skipped", skip_reason: jobSkip });
          summary.skipped++;
          continue;
        }

        const { data: client } = await admin
          .from("clients")
          .select("id, name, company, trading_name, is_active, status_emails_enabled")
          .eq("id", row.client_id)
          .maybeSingle();
        if (!client || client.is_active === false) {
          await finish({ status: "skipped", skip_reason: "client_archived" });
          summary.skipped++;
          continue;
        }
        if (client.status_emails_enabled === false) {
          await finish({ status: "skipped", skip_reason: "disabled_for_client" });
          summary.skipped++;
          continue;
        }

        const { data: portalUsers } = await admin
          .from("user_profiles")
          .select("email")
          .eq("role", "client")
          .eq("client_id", row.client_id)
          .eq("account_status", "active");
        const recipients = cleanRecipients((portalUsers ?? []).map((u: { email: string | null }) => u.email));
        if (recipients.length === 0) {
          await finish({ status: "skipped", skip_reason: "no_portal_users" });
          summary.skipped++;
          continue;
        }

        const { data: org } = await admin
          .from("organisations")
          .select("name, branding_name, logo_url, primary_colour, main_contact_email, main_contact_phone")
          .eq("id", row.org_id)
          .maybeSingle();

        const { data: insp } = await admin
          .from("inspections")
          .select("inspected_at, customer_name")
          .eq("job_id", row.job_id)
          .eq("type", row.event === "collected" ? "pickup" : "delivery")
          .is("archived_at", null)
          .order("inspected_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const email = renderStatusEmail({
          event: row.event,
          operator: {
            name: (org?.branding_name || org?.name || "").trim(),
            primaryColour: org?.primary_colour,
            logoUrl: org?.logo_url,
            contactEmail: org?.main_contact_email,
            contactPhone: org?.main_contact_phone,
          },
          clientName: client.trading_name || client.company || client.name,
          job: {
            reg: job!.vehicle_reg ?? "",
            make: job!.vehicle_make,
            model: job!.vehicle_model,
            ref: job!.external_job_number,
            fromPlace: place(job!.pickup_city, job!.pickup_postcode),
            toPlace: place(job!.delivery_city, job!.delivery_postcode),
          },
          at: insp?.inspected_at ?? new Date().toISOString(),
          receivedBy: row.event === "delivered" ? insp?.customer_name : null,
          portalUrl: baseUrl ? `${baseUrl}/portal/jobs/${row.job_id}` : null,
        });

        const replyTo = cleanRecipients([org?.main_contact_email])[0];
        const sentTo: string[] = [];
        const providerIds: string[] = [];
        const errors: string[] = [];
        // One email per person: recipients never see each other's address.
        for (const to of recipients) {
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromAddress,
              to: [to],
              subject: email.subject,
              html: email.html,
              text: email.text,
              ...(replyTo ? { reply_to: replyTo } : {}),
            }),
          });
          const body = await resp.json().catch(() => ({}));
          if (resp.ok) {
            sentTo.push(to);
            if (body?.id) providerIds.push(String(body.id));
          } else {
            errors.push(`${resp.status} ${String(body?.message ?? body?.name ?? "send failed").slice(0, 200)}`);
          }
        }

        if (sentTo.length > 0) {
          await finish({
            status: "sent",
            sent_at: new Date().toISOString(),
            recipients: sentTo,
            provider_ids: providerIds,
            last_error: errors.length ? errors.join("; ").slice(0, 1000) : null,
          });
          summary.sent++;
        } else {
          await finish({ status: "failed", last_error: errors.join("; ").slice(0, 1000) || "send failed" });
          summary.failed++;
        }
      } catch (e) {
        await finish({ status: "failed", last_error: (e instanceof Error ? e.message : String(e)).slice(0, 1000) });
        summary.failed++;
      }
    }

    return jsonRes(summary);
  } catch (e) {
    console.error("notify-customers error:", e instanceof Error ? e.message : e);
    return jsonRes({ error: "INTERNAL" }, 500);
  }
});
