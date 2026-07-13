import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_job",
  title: "Get job",
  description: "Fetch a single job by its UUID id, respecting RLS.",
  inputSchema: {
    id: z.string().uuid().describe("Job UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    // Explicit allowlist: operationally useful fields only. Internal pricing
    // (admin_rate, rate_per_mile, pricing_metadata), spreadsheet-sync columns,
    // and raw client contact PII are deliberately excluded from the agent view.
    const JOB_COLUMNS =
      "id, external_job_number, status, job_type, job_date, priority, " +
      "driver_name, driver_id, " +
      "vehicle_reg, vehicle_make, vehicle_model, vehicle_colour, vehicle_year, vehicle_type, vehicle_fuel_type, " +
      "pickup_company, pickup_city, pickup_postcode, pickup_contact_name, pickup_contact_phone, pickup_time_from, pickup_time_to, pickup_notes, " +
      "delivery_company, delivery_city, delivery_postcode, delivery_contact_name, delivery_contact_phone, delivery_time_from, delivery_time_to, delivery_notes, " +
      "client_name, client_company, " +
      "distance_miles, total_price, " +
      "has_pickup_inspection, has_delivery_inspection, " +
      "created_at, updated_at, completed_at";
    const { data, error } = await supabaseForUser(ctx)
      .from("jobs")
      .select(JOB_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: "Job not found or not accessible." }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { job: data },
    };
  },
});
