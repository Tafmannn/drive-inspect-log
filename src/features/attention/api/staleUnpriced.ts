import { supabase } from "@/integrations/supabase/client";
import { withPricing } from "@/lib/jobPricingApi";
import { ATTENTION_THRESHOLDS } from "../config/thresholds";

export interface StaleCompletedJob {
  id: string;
  org_id: string;
  completed_at: string | null;
  total_price: number | null;
}

/**
 * Completed jobs older than the billing lookback, with their price. Feeds
 * deriveStaleUnpricedSummary(). Throws on any read error rather than letting
 * a failed lookup read as "nothing unpriced".
 */
export async function fetchStaleCompletedJobs(nowMs: number = Date.now()): Promise<StaleCompletedJob[]> {
  const cutoff = new Date(nowMs - ATTENTION_THRESHOLDS.billingLookbackDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, org_id, completed_at")
    .eq("is_hidden", false)
    .eq("is_test", false) // test data never raises billing alerts (#146)
    .in("status", ["completed", "closed"])
    .lt("completed_at", cutoff)
    .limit(2000);
  if (error) throw error;
  return withPricing((data ?? []) as Array<{ id: string; org_id: string; completed_at: string | null }>);
}
