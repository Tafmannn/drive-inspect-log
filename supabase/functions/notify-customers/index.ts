// notify-customers — TURNED OFF (2026-11-17, owner's decision).
//
// This function used to send automatic "your vehicle has been collected /
// delivered" emails to a client's portal users when a job changed status.
// The owner wants every customer email (POD/POC) to be sent by hand, so it
// now sends nothing. It is kept deployed, answering 410, because installed
// copies of an older app version still call it after each inspection; a
// missing function would only produce noisier errors there.
//
// Customer emails are sent manually from the job's POD page ("Email POD"),
// which asks the admin to confirm the recipient first (send-pod-email).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({
      sent: 0,
      disabled: true,
      message: "Automatic customer emails are turned off. Send the POD manually from the job's POD page.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
