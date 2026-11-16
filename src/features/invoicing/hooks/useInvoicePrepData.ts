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
 *   4. linked to the selected client (client_id), or — for unlinked legacy
 *      jobs only — client_company / client_name matches it
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
import { findAlreadyInvoicedJobs } from "../api/createInvoice";

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
  // Route ends, for the "Leeds LS11 - Bristol BS34" part of the invoice line.
  pickup_city?: string | null;
  pickup_postcode?: string | null;
  delivery_city?: string | null;
  delivery_postcode?: string | null;
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
          "id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, job_date, completed_at, total_price, distance_miles, client_id, client_company, client_name, client_email, client_phone, status, pickup_city, pickup_postcode, delivery_city, delivery_postcode"
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

      // 2. Filter to this client's jobs. A linked job (client_id) belongs to
      //    exactly that client, whatever its free-text name says; only an
      //    unlinked legacy job falls back to matching by name or company.
      const clientJobs = (jobs as EligibleJob[]).filter((j) => {
        if (j.client_id) return j.client_id === client.id;
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

      // 3. Look up which jobs are already invoiced — via EITHER the
      //    multi-job flow (invoice_items) or the legacy single-job flow
      //    (invoices.job_id directly, e.g. from PodReport's "Create
      //    Invoice" button) — WORKFLOW-008. Do NOT drop matches: we
      //    surface them in the UI with an "Already invoiced" badge so
      //    admins can see the history rather than silently filtering.
      const jobIds = clientJobs.map((j) => j.id);
      const invoicedIds = await findAlreadyInvoicedJobs(jobIds);

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
