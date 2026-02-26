// src/integrations/supabase/client.ts
// --------------------------------------
// Secure Supabase Client (Lovable.dev Compatible)
// Uses environment variables instead of hard-coded keys
// --------------------------------------

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  globalThis.process?.env?.VITE_SUPABASE_URL ??
  (globalThis as any)?.env?.VITE_SUPABASE_URL ??
  import.meta.env.VITE_SUPABASE_URL;

const SUPABASE_PUBLIC_KEY =
  globalThis.process?.env?.VITE_SUPABASE_ANON_KEY ??
  (globalThis as any)?.env?.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate
if (!SUPABASE_URL) {
  console.error("❌ Missing VITE_SUPABASE_URL in environment.");
  throw new Error("Missing VITE_SUPABASE_URL");
}

if (!SUPABASE_PUBLIC_KEY) {
  console.error("❌ Missing VITE_SUPABASE_ANON_KEY in environment.");
  throw new Error("Missing VITE_SUPABASE_ANON_KEY");
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLIC_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);