/**
 * Vehicle catalogue artwork: list, upload and register images.
 * Writes are allowed for super admins only (RLS + storage policies).
 */
import { supabase } from "@/integrations/supabase/client";
import { VEHICLE_IMAGES_BUCKET } from "@/lib/vehicleCatalogueImage";
import type { Database } from "@/integrations/supabase/types";

export type CatalogueImageRow = Database["public"]["Tables"]["vehicle_catalogue_images"]["Row"];

export interface CatalogueImageInput {
  file: Blob;
  fileName: string;
  make: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  colour: string;
  bodyType: string | null;
}

export type UploadOutcome =
  | { status: "saved" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export async function listCatalogueImages(): Promise<CatalogueImageRow[]> {
  const { data, error } = await supabase
    .from("vehicle_catalogue_images")
    .select("*")
    .order("make")
    .order("model")
    .order("year_from");
  if (error) throw error;
  return data ?? [];
}

function friendlyInsertError(err: { code?: string; message?: string }): string {
  if (err.code === "23P01") return "Overlaps an existing image for this make, model, colour and years";
  if (err.code === "23505") return "This file name is already registered";
  if (err.code === "42501") return "Only super admins can add catalogue images";
  return err.message ?? "Could not save the database row";
}

/** Upload the file, then register it. If registering fails, the upload is removed again. */
export async function uploadCatalogueImage(input: CatalogueImageInput): Promise<UploadOutcome> {
  const contentType = input.fileName.endsWith(".webp") ? "image/webp" : "image/png";
  const bucket = supabase.storage.from(VEHICLE_IMAGES_BUCKET);

  const { error: upErr } = await bucket.upload(input.fileName, input.file, { contentType, upsert: false });
  if (upErr) {
    const msg = upErr.message ?? "";
    if (/exists|duplicate/i.test(msg)) return { status: "skipped", reason: "A file with this name is already uploaded" };
    return { status: "failed", reason: msg || "Upload failed" };
  }

  const { error: dbErr } = await supabase.from("vehicle_catalogue_images").insert({
    make: input.make.trim(),
    model: input.model.trim(),
    year_from: input.yearFrom,
    year_to: input.yearTo,
    colour: input.colour,
    body_type: input.bodyType,
    image_path: input.fileName,
  });
  if (dbErr) {
    await bucket.remove([input.fileName]);
    return { status: "failed", reason: friendlyInsertError(dbErr) };
  }
  return { status: "saved" };
}
