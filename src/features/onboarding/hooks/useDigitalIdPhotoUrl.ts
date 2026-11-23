import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Signed private photo URL, never persisted to local storage or job evidence. */
export function useDigitalIdPhotoUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!path) return;
    const resolve = async () => {
      const { data, error } = await supabase.storage
        .from("digital-id-photos")
        .createSignedUrl(path, 90);
      if (!cancelled) setUrl(error ? null : data?.signedUrl ?? null);
    };
    void resolve();
    const interval = window.setInterval(() => { void resolve(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [path]);
  return url;
}
