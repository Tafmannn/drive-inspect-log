import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type SignedPhoto = { path: string | null; url: string | null };

/**
 * Signed private photo URL, never persisted to local storage or job evidence.
 * Always associate a URL with its originating storage path so switching
 * drivers cannot briefly render the prior driver's photograph before effects run.
 */
export function useDigitalIdPhotoUrl(path: string | null | undefined) {
  const currentPath = path ?? null;
  const [signed, setSigned] = useState<SignedPhoto>({ path: null, url: null });

  useEffect(() => {
    let cancelled = false;
    setSigned({ path: currentPath, url: null });
    if (!currentPath) return;
    const resolve = async () => {
      try {
        const { data, error } = await supabase.storage
          .from("digital-id-photos")
          .createSignedUrl(currentPath, 90);
        if (!cancelled) {
          setSigned({ path: currentPath, url: error ? null : data?.signedUrl ?? null });
        }
      } catch {
        if (!cancelled) setSigned({ path: currentPath, url: null });
      }
    };
    void resolve();
    const interval = window.setInterval(() => { void resolve(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [currentPath]);

  return signed.path === currentPath ? signed.url : null;
}
