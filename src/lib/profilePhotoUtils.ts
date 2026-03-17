import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a profile photo path to a public/signed URL.
 * Returns null if path is empty.
 */
export function resolveProfilePhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
  return data?.publicUrl ?? null;
}
