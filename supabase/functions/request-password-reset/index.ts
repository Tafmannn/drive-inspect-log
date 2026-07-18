/**
 * request-password-reset — public endpoint backing the "Forgot password"
 * screen. Sends an Axentra-branded reset email via Resend instead of
 * Supabase's generic default template (falls back to Supabase's built-in
 * email if RESEND_API_KEY isn't configured, so resets never silently stop
 * working).
 *
 * Enumeration-safe by design: ALWAYS returns { success: true } regardless of
 * whether the email belongs to an account, matches the behaviour of
 * supabase-js's client-side resetPasswordForEmail() that this replaces.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createIpRateLimiter } from "../_shared/rateLimit.ts";
import { renderActionEmailHtml, resolveRedirectUrl, sendBrandedEmail } from "../_shared/brandedEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Public, unauthenticated, and triggers an email send — keep the budget
// tight (default rate limiter is 30/min, too loose for an auth endpoint).
const rateLimiter = createIpRateLimiter(corsHeaders, { maxPerWindow: 5, windowMs: 60_000 });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const limited = rateLimiter.check(req);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      return json({ error: "INVALID_EMAIL" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const redirectTo = resolveRedirectUrl(req, "/reset-password");

    if (Deno.env.get("RESEND_API_KEY")) {
      // generateLink creates the recovery token WITHOUT sending Supabase's
      // built-in email; we deliver it ourselves via Resend. If the email
      // doesn't belong to an account this errors (e.g. "User not found") —
      // deliberately swallowed below so the response never reveals account
      // existence.
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

      if (!linkErr && linkData?.properties?.action_link) {
        const sent = await sendBrandedEmail({
          to: email,
          subject: "Reset your Axentra password",
          html: renderActionEmailHtml({
            firstName: null,
            introHtml:
              "We received a request to reset the password for your " +
              "<strong>Axentra Vehicle Logistics</strong> account. Click the button " +
              "below to choose a new password.",
            buttonLabel: "Reset my password",
            actionLink: linkData.properties.action_link,
            noteHtml:
              "This link is valid for 1 hour and can only be used once. If you " +
              "didn't request this, you can safely ignore this email — your " +
              "password will not be changed.",
          }),
        });
        if (!sent.ok) console.error("password reset email send failed", sent.detail);
      } else if (linkErr) {
        // Expected/benign for unknown emails; logged only for operational
        // visibility, never surfaced to the caller.
        console.error("password reset link generation failed", linkErr.message);
      }
    } else {
      // No Resend key: Supabase's built-in recovery email still works
      // (generic template) and is equally enumeration-safe.
      const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
      if (resetErr) console.error("password reset fallback failed", resetErr.message);
    }

    return json({ success: true });
  } catch (e) {
    console.error("request-password-reset error", e instanceof Error ? e.message : e);
    // Still enumeration-safe on unexpected errors.
    return json({ success: true });
  }
});
