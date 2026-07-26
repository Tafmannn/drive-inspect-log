// Web Push sender — job-assignment notifications.
//
// SECURITY MODEL: this is NOT a general notification endpoint. Callers must
// be authenticated admins (authoritative role from user_profiles, never JWT
// metadata) and may supply ONLY { event, jobId }. Everything else — the
// recipient, title, body, deep link — is resolved server-side from trusted
// job data, so no caller can push arbitrary content or target arbitrary
// users. Admins are org-scoped to their own jobs. Delivery is best-effort:
// a push failure must never surface as an assignment failure.
//
// Lock-screen privacy: the notification carries only the vehicle
// registration — never customer names, phones, addresses or notes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "npm:web-push@3.6.7";
import { authenticateCaller, corsHeaders, jsonRes } from "../_shared/auth.ts";

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateCaller(req);
    if ("error" in authResult) return authResult.error;
    const { caller, admin } = authResult;

    if (caller.accountStatus === "suspended") {
      return jsonRes({ error: "ACCOUNT_SUSPENDED" }, 403);
    }
    if (!caller.isAdmin) {
      return jsonRes({ error: "ADMIN_OR_SUPER_ADMIN_ONLY" }, 403);
    }

    const body = await req.json().catch(() => null);
    const event = body?.event;
    const jobId = body?.jobId;
    if (event !== "job-assigned") {
      return jsonRes({ error: "UNSUPPORTED_EVENT" }, 400);
    }
    if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) {
      return jsonRes({ error: "INVALID_JOB_ID" }, 400);
    }

    // Trusted payload source: the job row itself.
    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .select("id, org_id, driver_id, vehicle_reg, external_job_number")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr) return jsonRes({ error: "JOB_LOOKUP_FAILED" }, 500);
    if (!job) return jsonRes({ error: "JOB_NOT_FOUND" }, 404);

    // Org admins can only notify about their own org's jobs.
    if (!caller.isSuperAdmin && job.org_id !== caller.orgId) {
      return jsonRes({ error: "CROSS_ORG_FORBIDDEN" }, 403);
    }
    if (!job.driver_id) {
      return jsonRes({ sent: 0, reason: "NO_DRIVER_ASSIGNED" });
    }

    // driver_profiles.user_id → the auth user whose devices we notify.
    const { data: driver, error: driverErr } = await admin
      .from("driver_profiles")
      .select("user_id")
      .eq("id", job.driver_id)
      .maybeSingle();
    if (driverErr || !driver?.user_id) {
      return jsonRes({ sent: 0, reason: "DRIVER_HAS_NO_USER" });
    }

    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, failure_count")
      .eq("user_id", driver.user_id);
    if (subsErr) return jsonRes({ error: "SUBSCRIPTION_LOOKUP_FAILED" }, 500);
    if (!subs || subs.length === 0) {
      return jsonRes({ sent: 0, reason: "NO_SUBSCRIPTIONS" });
    }

    // VAPID keys live in push_config (RLS: service-role only).
    const { data: cfg, error: cfgErr } = await admin
      .from("push_config")
      .select("vapid_public_key, vapid_private_key, vapid_subject")
      .eq("id", true)
      .maybeSingle();
    if (cfgErr || !cfg) return jsonRes({ error: "PUSH_NOT_CONFIGURED" }, 500);

    webpush.setVapidDetails(
      cfg.vapid_subject,
      cfg.vapid_public_key,
      cfg.vapid_private_key,
    );

    const reg = job.vehicle_reg || job.external_job_number || "A vehicle";
    const payload = JSON.stringify({
      type: "job-assigned",
      jobId: job.id,
      title: "New job assigned",
      body: `${reg} is ready to review.`,
    });

    let sent = 0;
    let pruned = 0;
    let failed = 0;
    await Promise.all(
      (subs as SubRow[]).map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
            { TTL: 60 * 60 },
          );
          sent++;
          await admin
            .from("push_subscriptions")
            .update({ last_success_at: new Date().toISOString(), failure_count: 0 })
            .eq("id", sub.id);
        } catch (err) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            // Endpoint permanently gone — prune it.
            pruned++;
            await admin.from("push_subscriptions").delete().eq("id", sub.id);
          } else {
            // Transient (429/5xx/network): keep the row, count the failure.
            // Never log the endpoint or keys.
            failed++;
            await admin
              .from("push_subscriptions")
              .update({ failure_count: sub.failure_count + 1 })
              .eq("id", sub.id);
          }
        }
      }),
    );

    return jsonRes({ sent, pruned, failed });
  } catch (e) {
    console.error("send-push error:", e instanceof Error ? e.message : "unknown");
    return jsonRes({ error: "INTERNAL_ERROR" }, 500);
  }
});
