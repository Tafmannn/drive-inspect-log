// src/integrations/supabase/client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ✅ OK to be public (publishable/anon key)
// ❌ DO NOT put any service_role/secret key in frontend code

const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "sb-pub-PASTE-YOUR-NEW-PUBLISHABLE-KEY-HERE";

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});