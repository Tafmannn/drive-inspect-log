import { supabase } from "@/integrations/supabase/client";

const SIGNED_TTL_SECONDS = 3600;

/**
 * Resolve a profile photo storage path to a browser-usable URL.
 * The `profile-photos` bucket is private (org-scoped RLS), so this must
 * sign the URL — a plain getPublicUrl() would return an unfetchable link.
 * Returns null if path is empty or signing fails.
 */
export async function resolveProfilePhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage
      .from("profile-photos")
      .createSignedUrl(path, SIGNED_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
