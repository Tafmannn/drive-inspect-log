import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateCaller, corsHeaders, jsonRes } from "../_shared/auth.ts";

// SECURITY (Phase 1 reviewer fix):
//   The previous implementation (a) authorized off the self-writable
//   `user_metadata.role` — letting any user self-escalate to "admin" — and then
//   (b) set GCS ACL `allUsers:READER` on EVERY photo and signature across ALL
//   organisations, making all customer media public on the internet. That
//   directly contradicts the Phase 1 model (private bucket + short-lived signed
//   URLs via gcs-proxy) and undoes the C1/C2/C6 fixes.
//
//   This "make media public" capability is removed. The endpoint now authorizes
//   from `user_profiles` (super-admin only) and returns a disabled response —
//   media is served exclusively through gcs-proxy signed URLs.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authorize from user_profiles (never JWT user_metadata).
    const authResult = await authenticateCaller(req);
    if ("error" in authResult) return authResult.error;
    const { caller } = authResult;

    if (caller.accountStatus === "suspended") {
      return jsonRes({ error: "ACCOUNT_SUSPENDED" }, 403);
    }
    if (!caller.isSuperAdmin) {
      return jsonRes({ error: "SUPER_ADMIN_ONLY" }, 403);
    }

    // The public-ACL operation is intentionally disabled.
    return jsonRes(
      {
        error: "DISABLED",
        message:
          "Making customer media public (allUsers:READER) is disabled by " +
          "security policy. Media is private and served via short-lived signed " +
          "URLs through gcs-proxy.",
      },
      410,
    );
  } catch (e: unknown) {
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
