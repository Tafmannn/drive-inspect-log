/**
 * Hook: un-invoiced work per client for the Invoice Prep "Ready to bill" panel.
 * Every read fails closed (throws) — an unknown invoice state or fee is never shown as
 * "nothing to bill".
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPricingByJobId } from "@/lib/jobPricingApi";
import { getCurrentAbortsForJobs } from "@/features/abort/api/abortApi";
import { invoicedAmong, ID_PAGE_SIZE } from "@/hooks/useAdminOperationsBuckets";
import { summariseReadyToBill, type BillableJobRow, type ReadyToBillSummary } from "../lib/readyToBill";

export const READY_TO_BILL_KEY = ["invoicing", "ready-to-bill"] as const;

async function fetchBillableRows(): Promise<BillableJobRow[]> {
  const rows: BillableJobRow[] = [];
  for (let from = 0; ; from += ID_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("jobs")
      .select("id, client_id, status")
      .eq("is_hidden", false)
      .eq("is_test", false)
      .in("status", ["completed", "closed", "aborted"])
      .order("id")
      .range(from, from + ID_PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load jobs to bill: ${error.message}`);
    rows.push(...((data ?? []) as BillableJobRow[]));
    if (!data || data.length < ID_PAGE_SIZE) return rows;
  }
}

export async function loadReadyToBill(): Promise<ReadyToBillSummary> {
  const rows = await fetchBillableRows();
  if (rows.length === 0) return { clients: [], unlinked: 0 };
  const ids = rows.map((r) => r.id);
  const abortedIds = rows.filter((r) => r.status === "aborted").map((r) => r.id);
  const pricedIds = rows.filter((r) => r.status !== "aborted").map((r) => r.id);
  const [invoiced, pricing, aborts] = await Promise.all([
    invoicedAmong(ids),
    fetchPricingByJobId(pricedIds),
    getCurrentAbortsForJobs(abortedIds),
  ]);
  const priceByJob = new Map<string, number | null>();
  for (const [id, row] of pricing) priceByJob.set(id, row.total_price == null ? null : Number(row.total_price));
  return summariseReadyToBill(rows, priceByJob, aborts, invoiced);
}

export function useReadyToBill() {
  return useQuery({ queryKey: READY_TO_BILL_KEY, queryFn: loadReadyToBill, staleTime: 30_000 });
}
