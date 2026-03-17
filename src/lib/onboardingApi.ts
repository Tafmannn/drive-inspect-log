/**
 * Driver onboarding API with typed document status semantics.
 */
import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "./orgHelper";

export type OnboardingStatus = "draft" | "pending_review" | "approved" | "rejected";

export type DocStatus = "missing" | "uploaded" | "approved" | "rejected" | "expired";

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

export interface DocSlot {
  type: "headshot" | "licence_front" | "licence_back";
  label: string;
  url: string | null;
  status: DocStatus;
}

/**
 * Derive typed document status from record state.
 */
export function getDocSlots(record: OnboardingRecord): DocSlot[] {
  const today = new Date().toISOString().slice(0, 10);
  const licenceExpired = record.licence_expiry ? record.licence_expiry < today : false;

  function docStatus(url: string | null, isLicence: boolean): DocStatus {
    if (!url) return "missing";
    if (isLicence && licenceExpired) return "expired";
    if (record.status === "approved") return "approved";
    if (record.status === "rejected") return "rejected";
    return "uploaded";
  }

  return [
    { type: "headshot", label: "Headshot / ID", url: record.headshot_url, status: docStatus(record.headshot_url, false) },
    { type: "licence_front", label: "Licence Front", url: record.licence_front_url, status: docStatus(record.licence_front_url, true) },
    { type: "licence_back", label: "Licence Back", url: record.licence_back_url, status: docStatus(record.licence_back_url, true) },
  ];
}

/**
 * Count missing required documents.
 */
export function countMissingDocs(record: OnboardingRecord): number {
  const slots = getDocSlots(record);
  // headshot and licence_front are required
  return [slots[0], slots[1]].filter(s => s.status === "missing").length;
}

/**
 * Evaluate dispatch eligibility from onboarding state.
 */
export function isDispatchEligible(record: OnboardingRecord): boolean {
  if (record.status !== "approved") return false;
  const slots = getDocSlots(record);
  return slots[0].status !== "missing" && slots[1].status !== "missing" && slots[1].status !== "expired";
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

/**
 * Get onboarding compliance summary counts for admin dashboard.
 */
export async function getComplianceCounts(): Promise<{
  pendingReview: number;
  missingDocs: number;
  expiredLicences: number;
}> {
  const { data, error } = await supabase
    .from("driver_onboarding")
    .select("*")
    .in("status", ["draft", "pending_review", "approved"]);
  if (error) throw error;

  const records = (data ?? []) as OnboardingRecord[];
  const today = new Date().toISOString().slice(0, 10);

  let pendingReview = 0;
  let missingDocs = 0;
  let expiredLicences = 0;

  for (const r of records) {
    if (r.status === "pending_review") pendingReview++;
    if (!r.headshot_url || !r.licence_front_url) missingDocs++;
    if (r.licence_expiry && r.licence_expiry < today) expiredLicences++;
  }

  return { pendingReview, missingDocs, expiredLicences };
}
