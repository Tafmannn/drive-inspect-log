import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveProfilePhotoUrl } from "@/lib/profilePhotoUtils";

/** Resolves a profile-photos storage path to a signed, displayable URL. */
export function useProfilePhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveProfilePhotoUrl(path).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}

/** The logged-in user's own profile_photo_path, for display in chrome (topbar, self-profile). */
export function useOwnProfilePhotoPath() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["own-profile-photo-path", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("profile_photo_path")
        .eq("auth_user_id", user!.id)
        .maybeSingle();
      return data?.profile_photo_path ?? null;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}
