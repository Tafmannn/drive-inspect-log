import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { checkSupabaseTarget } from "@/lib/supabaseTarget";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY env vars");
}

// Fail closed: a staging build must never talk to production (and no build may
// ship a secret key). The same check already ran at build time in vite.config.ts.
const target = checkSupabaseTarget({
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,
  appEnv: import.meta.env.VITE_APP_ENV as string | undefined,
});
if (!target.ok) {
  throw new Error("Refusing to start: " + target.errors.join("; "));
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
