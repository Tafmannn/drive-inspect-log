/**
 * Phase 5 — Driver onboarding API.
 * Admin-managed workflow: draft → pending_review → approved | rejected.
 */
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "./orgHelper";

export type OnboardingStatus = "draft" | "pending_review" | "approved" | "rejected";

export interface OnboardingRecord {
  id: string;
  org_id: string;
  linked_user_id: string | null;
  full_name: string;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  employment_type: string | null;
  trade_plate_number: string | null;
  licence_expiry: string | null;
  notes: string | null;
  status: OnboardingStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  headshot_url: string | null;
  licence_front_url: string | null;
  licence_back_url: string | null;
  created_at: string;
  updated_at: string;
}

export async function listOnboarding(statusFilter?: OnboardingStatus): Promise<OnboardingRecord[]> {
  let query = supabase.from("driver_onboarding").select("*").order("created_at", { ascending: false });
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OnboardingRecord[];
}

export async function getOnboarding(id: string): Promise<OnboardingRecord> {
  const { data, error } = await supabase.from("driver_onboarding").select("*").eq("id", id).single();
  if (error) throw error;
  return data as OnboardingRecord;
}

export async function createOnboarding(input: {
  full_name: string;
  display_name?: string;
  phone?: string;
  email?: string;
  employment_type?: string;
  trade_plate_number?: string;
  licence_expiry?: string;
  notes?: string;
}): Promise<OnboardingRecord> {
  const orgId = await getOrgId();
  const { data, error } = await supabase.from("driver_onboarding").insert({
    org_id: orgId,
    full_name: input.full_name,
    display_name: input.display_name ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    employment_type: input.employment_type ?? "contractor",
    trade_plate_number: input.trade_plate_number ?? null,
    licence_expiry: input.licence_expiry ?? null,
    notes: input.notes ?? null,
    status: "draft",
  } as any).select().single();
  if (error) throw error;
  return data as OnboardingRecord;
}

export async function updateOnboarding(id: string, fields: Partial<OnboardingRecord>): Promise<OnboardingRecord> {
  const { data, error } = await supabase.from("driver_onboarding").update(fields as any).eq("id", id).select().single();
  if (error) throw error;
  return data as OnboardingRecord;
}

export async function reviewOnboarding(id: string, decision: "approved" | "rejected", reviewNotes?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("driver_onboarding").update({
    status: decision,
    reviewed_by: user?.id ?? null,
    reviewed_at: new Date().toISOString(),
    review_notes: reviewNotes ?? null,
  } as any).eq("id", id);
  if (error) throw error;
}

export async function uploadOnboardingDoc(
  onboardingId: string,
  docType: "headshot" | "licence_front" | "licence_back",
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${onboardingId}/${docType}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from("onboarding-docs").upload(path, file, { upsert: true });
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

  const { data: signedData, error: signErr } = await supabase.storage
    .from("onboarding-docs")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signErr || !signedData?.signedUrl) throw new Error("Failed to generate URL");

  const urlField = `${docType}_url` as keyof OnboardingRecord;
  await supabase.from("driver_onboarding").update({ [urlField]: signedData.signedUrl } as any).eq("id", onboardingId);

  return signedData.signedUrl;
}
