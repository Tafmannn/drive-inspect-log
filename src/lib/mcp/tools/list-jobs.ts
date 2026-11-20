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
  name: "list_jobs",
  title: "List jobs",
  description:
    "List jobs visible to the signed-in user, respecting org and role scoping via RLS. Optional status filter and limit (default 20, max 100).",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe("Optional job status filter, e.g. 'PENDING', 'IN_PROGRESS', 'COMPLETED'."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Max rows to return (default 20, capped at 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const cap = Math.min(Math.max(limit ?? 20, 1), 100);
    const client = supabaseForUser(ctx);
    let q = client
      .from("jobs")
      .select(
        "id, external_job_number, status, driver_name, pickup_city, pickup_postcode, delivery_city, delivery_postcode, job_date, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(cap);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    // Prices live in the admin-only job_pricing table; a non-admin gets no rows there.
    const rows = (data ?? []) as Array<{ id: string; total_price?: number | null }>;
    if (rows.length > 0) {
      const { data: pricing } = await client
        .from("job_pricing")
        .select("job_id, total_price")
        .in("job_id", rows.map((r) => r.id));
      const byJob = new Map((pricing ?? []).map((p: any) => [p.job_id, p.total_price]));
      for (const r of rows) r.total_price = (byJob.get(r.id) as number | null | undefined) ?? null;
    }
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { jobs: rows },
    };
  },
});
