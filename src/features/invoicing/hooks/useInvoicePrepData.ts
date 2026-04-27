/**
 * Hook: useInvoicePrepData
 * Fetches eligible (completed, uninvoiced) jobs for a given client.
 *
 * Stage 5 — strict invoice readiness:
 *   1. status MUST be 'completed' (or 'closed'). pod_ready / delivery_complete
 *      are NEVER invoice-ready — admin must review the POD first which
 *      transitions the job to 'completed' via complete_job RPC.
 *   2. is_hidden = false
 *   3. not already linked to an invoice_items row
 *   4. client_company or client_name matches the selected client
 *   5. Each row carries a readinessReason so the UI can render a clear badge.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Client } from "@/lib/clientApi";
import {
  evaluateInvoiceReadiness,
  INVOICEABLE_STATUSES,
  type InvoiceReadinessResult,
} from "@/lib/invoiceReadiness";

export interface EligibleJob {
  id: string;
  external_job_number: string | null;
  vehicle_reg: string;
  vehicle_make: string;
  vehicle_model: string;
  job_date: string | null;
  completed_at: string | null;
  total_price: number | null;
  distance_miles: number | null;
  client_id: string | null;
  client_company: string | null;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  status: string;
  // receipt count from expenses
  receiptCount?: number;
  // Stage 5 readiness — populated below.
  readiness?: InvoiceReadinessResult;
}

// Only jobs in a true terminal state are surfaced. POD-ready and
// delivery-complete are intentionally excluded (Stage 5 rule).
const TERMINAL_STATUSES = [...INVOICEABLE_STATUSES];


export function useEligibleJobs(
  client: Client | null,
  opts?: { dateFrom?: string; dateTo?: string }
) {
  return useQuery({
    queryKey: [
      "invoice-prep-eligible",
      client?.id ?? null,
      opts?.dateFrom,
      opts?.dateTo,
    ],
    queryFn: async (): Promise<EligibleJob[]> => {
      if (!client) return [];

      // 1. Get all completed, visible jobs
      let query = supabase
        .from("jobs")
        .select(
          "id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, job_date, completed_at, total_price, distance_miles, client_id, client_company, client_name, client_email, client_phone, status"
        )
        .eq("is_hidden", false)
        .in("status", TERMINAL_STATUSES)
        .order("completed_at", { ascending: false });

      // Date range filters
      if (opts?.dateFrom) {
        query = query.gte("completed_at", opts.dateFrom);
      }
      if (opts?.dateTo) {
        // Add a day to make "to" inclusive
        const toDate = new Date(opts.dateTo);
        toDate.setDate(toDate.getDate() + 1);
        query = query.lt("completed_at", toDate.toISOString());
      }

      const { data: jobs, error } = await query;
      if (error) throw error;
      if (!jobs?.length) return [];

      // 2. Filter to jobs matching this client (by name or company)
      const clientJobs = (jobs as EligibleJob[]).filter((j) => {
        const jClient = (j.client_company || j.client_name || "").toLowerCase();
        const cName = client.name.toLowerCase();
        const cCompany = (client.company || "").toLowerCase();
        return (
          jClient === cName ||
          jClient === cCompany ||
          (cCompany && jClient.includes(cCompany)) ||
          jClient.includes(cName)
        );
      });

      if (!clientJobs.length) return [];

      // 3. Look up which jobs are already in invoice_items (do NOT drop —
      //    we surface them in the UI with an "Already invoiced" badge so
      //    admins can see the history rather than silently filtering).
      const jobIds = clientJobs.map((j) => j.id);
      const { data: invoiced } = await supabase
        .from("invoice_items")
        .select("job_id")
        .in("job_id", jobIds);

      const invoicedIds = new Set((invoiced ?? []).map((r: any) => r.job_id));

      // 4. Receipt counts from expenses (used by readiness warnings + UI)
      const countMap = new Map<string, number>();
      if (clientJobs.length > 0) {
        const { data: expenses } = await supabase
          .from("expenses")
          .select("job_id")
          .in("job_id", jobIds)
          .eq("is_hidden", false);
        (expenses ?? []).forEach((e: any) => {
          countMap.set(e.job_id, (countMap.get(e.job_id) ?? 0) + 1);
        });
      }

      // 5. Annotate every row with strict invoice readiness so the UI
      //    can render an exact reason badge per row.
      for (const j of clientJobs) {
        j.receiptCount = countMap.get(j.id) ?? 0;
        j.readiness = evaluateInvoiceReadiness({
          job: j,
          alreadyInvoiced: invoicedIds.has(j.id),
          receiptCount: j.receiptCount,
        });
      }

      return clientJobs;
    },
    enabled: !!client,
    staleTime: 15_000,
  });
}

/** Compute invoice preview totals from selected jobs */
export function computePreviewTotals(
  jobs: EligibleJob[],
  vatRate: number = 20
): {
  subtotal: number;
  vatAmount: number;
  total: number;
  receiptCount: number;
  jobCount: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let subtotal = 0;
  let receiptCount = 0;

  // Check for mixed clients
  const clientNames = new Set<string>();
  jobs.forEach((j) => {
    const cn = (j.client_company || j.client_name || "Unknown").toLowerCase();
    clientNames.add(cn);
  });
  if (clientNames.size > 1) {
    warnings.push("Selected jobs have mixed client names — review before invoicing.");
  }

  // Check for missing prices
  const noPriceJobs = jobs.filter((j) => !j.total_price || j.total_price <= 0);
  if (noPriceJobs.length > 0) {
    warnings.push(
      `${noPriceJobs.length} job(s) have no price set — total may be inaccurate.`
    );
  }

  jobs.forEach((j) => {
    subtotal += j.total_price ?? 0;
    receiptCount += j.receiptCount ?? 0;
  });

  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  return {
    subtotal,
    vatAmount,
    total,
    receiptCount,
    jobCount: jobs.length,
    warnings,
  };
}
