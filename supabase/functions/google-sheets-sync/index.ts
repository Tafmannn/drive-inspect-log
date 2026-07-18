// RETIRED. The Google Sheets sync feature is disabled:
//   - its `sheet_sync_config` table no longer exists, so every action 500'd
//   - nothing in the app references it (no UI, no client calls)
//   - the old implementation authorized off user-writable JWT `user_metadata`
//     (role/org), letting any authenticated user act as an admin of any org
//     for pull/push of jobs and expenses data.
// Kept as a stub so stale clients get a clear 410 instead of a crash.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(() =>
  new Response(
    JSON.stringify({
      error: "DISABLED",
      message: "Google Sheets sync has been retired.",
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  )
);
