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
      .select("id, job_ref, status, driver_name, pickup_address, delivery_address, created_at")
      .order("created_at", { ascending: false })
      .limit(cap);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { jobs: data ?? [] },
    };
  },
});
