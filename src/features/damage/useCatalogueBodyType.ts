/**
 * Body type from the shared vehicle catalogue entry the job is already matched
 * to (jobs.catalogue_image_path, set server-side from make/model/year). Only
 * used when the job itself records no usable body type; returns null when the
 * catalogue has none, offline, or on any error — the UI then asks the driver.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCatalogueBodyType(imagePath: string | null): string | null {
  const { data } = useQuery({
    queryKey: ["catalogue-body-type", imagePath],
    enabled: !!imagePath,
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_catalogue_images")
        .select("body_type")
        .eq("image_path", imagePath!)
        .maybeSingle();
      if (error) return null;
      return (data?.body_type as string | null) ?? null;
    },
  });
  return data ?? null;
}
