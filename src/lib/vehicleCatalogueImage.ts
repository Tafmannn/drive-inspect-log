/**
 * Public URL for catalogue vehicle artwork.
 *
 * Artwork lives in the PUBLIC `vehicle-images` bucket (shared, non-tenant
 * catalogue renders — no job evidence). `jobs.catalogue_image_path` is set by
 * the `zz_jobs_catalogue_image` DB trigger from make/model/year/colour, so the
 * client only turns the stored file name into a URL.
 */
import { supabase } from "@/integrations/supabase/client";

export const VEHICLE_IMAGES_BUCKET = "vehicle-images";

/** Flat file names only, e.g. "bmw-x5-2019-2023-black.png". */
const SAFE_PATH = /^[a-z0-9][a-z0-9._-]*\.(png|webp)$/i;

export function vehicleCatalogueImageUrl(path: string | null | undefined): string | null {
  if (!path || !SAFE_PATH.test(path)) return null;
  const { data } = supabase.storage.from(VEHICLE_IMAGES_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}
