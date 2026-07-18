// RETIRED. Superseded by the `user-lifecycle` edge function, which is the
// single path for user management. This legacy endpoint wrote role/org only
// to JWT metadata (never user_profiles, the authoritative source) and its
// create_user action silently overwrote existing accounts' role and org when
// given an already-registered email. Kept as a stub so stale clients get a
// clear 410 instead of unsafe behavior.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({
      error: "DISABLED",
      message: "promote-admin has been retired; use user-lifecycle.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
