import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listJobsTool from "./tools/list-jobs";
import getJobTool from "./tools/get-job";

// The OAuth issuer MUST be the direct Supabase host, built from the project ref.
// VITE_SUPABASE_PROJECT_ID is inlined by Vite at build time so this stays
// import-safe (no runtime env read at module load).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "axentra-mcp",
  title: "Axentra MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Axentra fleet operations app. Use `whoami` to verify connectivity, `list_jobs` to browse jobs visible to the signed-in user, and `get_job` to fetch details for a single job. All data access respects the user's org and role via RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listJobsTool, getJobTool],
});
