import { supabase } from "@/integrations/supabase/client";

export interface QrConfirmation {
  id: string;
  job_id: string;
  event_type: string;
  token: string;
  expires_at: string;
  confirmed_at: string | null;
  customer_name: string | null;
  notes: string | null;
  created_at: string;
}

export async function createQrConfirmation(
  jobId: string,
  eventType: "collection" | "delivery"
): Promise<QrConfirmation> {
  const { data, error } = await supabase
    .from("qr_confirmations")
    .insert({ job_id: jobId, event_type: eventType })
    .select()
    .single();
  if (error) throw error;
  return data as QrConfirmation;
}

export async function getQrConfirmationsForJob(
  jobId: string
): Promise<QrConfirmation[]> {
  const { data, error } = await supabase
    .from("qr_confirmations")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QrConfirmation[];
}

/**
 * Build the URL that the QR code links to.
 * Uses the current origin so it works in any environment.
 */
export function buildQrUrl(token: string): string {
  return `${window.location.origin}/confirm?token=${token}`;
}
