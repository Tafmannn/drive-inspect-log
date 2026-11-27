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
 *   6. Aborted jobs are listed too (the Abort exception): ready only once their
 *      Abort fee is approved above zero, and billed at that fee. Their date is
 *      the Abort confirmation time (they have no completed_at).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Client } from "@/lib/clientApi";
import {
  evaluateInvoiceReadiness,
  INVOICEABLE_STATUSES,
  type AbortInvoiceInfo,
  type InvoiceReadinessResult,
} from "@/lib/invoiceReadiness";
import { getCurrentAbortsForJobs } from "@/features/abort/api/abortApi";
import type { Inspection, Photo } from "@/lib/types";
import { findAlreadyInvoicedJobs } from "../api/createInvoice";
import { withPricing } from "@/lib/jobPricingApi";

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
  // Evidence inputs for the readiness check (loaded in step 5).
  current_run_id?: string | null;
  photos?: Photo[];
  inspections?: Inspection[];
  // receipt count from expenses
  receiptCount?: number;
  // Stage 5 readiness — populated below.
  readiness?: InvoiceReadinessResult;
  // Aborted jobs only (status 'aborted').
  abort?: AbortInvoiceInfo | null;
  /** Approved Abort fee: what the invoice line is billed at. */
  abort_fee?: number | null;
  abort_confirmed_at?: string | null;
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
          "id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, job_date, completed_at, distance_miles, client_id, client_company, client_name, client_email, client_phone, status, current_run_id, pickup_city, pickup_postcode, delivery_city, delivery_postcode"
        )
        .eq("is_hidden", false)
        .eq("is_test", false)
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

      // Aborted jobs have no completed_at, so they are read separately and their
      // date filter is applied to the Abort confirmation time below.
      const abortedQuery = supabase
        .from("jobs")
        .select(
          "id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, job_date, completed_at, distance_miles, client_id, client_company, client_name, client_email, client_phone, status, current_run_id, pickup_city, pickup_postcode, delivery_city, delivery_postcode"
        )
        .eq("is_hidden", false)
        .eq("is_test", false)
        .eq("status", "aborted");

      const [{ data: jobsRaw, error }, { data: abortedRaw, error: abortedErr }] = await Promise.all([
        query,
        abortedQuery,
      ]);
      if (error) throw error;
      if (abortedErr) throw abortedErr;

      // Attach each aborted job's current Abort. A failed read throws: an
      // unknown fee is never treated as approved (or as zero).
      const aborts = await getCurrentAbortsForJobs((abortedRaw ?? []).map((j) => j.id));
      const from = opts?.dateFrom ? new Date(opts.dateFrom).getTime() : null;
      const to = opts?.dateTo ? new Date(opts.dateTo).getTime() + 86_400_000 : null;
      const abortedRows = (abortedRaw ?? []).flatMap((j) => {
        const a = aborts.get(j.id);
        const at = a ? new Date(a.confirmed_at).getTime() : NaN;
        if (from != null && !(at >= from)) return [];
        if (to != null && !(at < to)) return [];
        const approved = a && a.finance_status === "approved" && a.approved_amount != null && a.approved_amount > 0;
        return [{
          ...j,
          completed_at: null,
          abort: a ? { finance_status: a.finance_status, approved_amount: a.approved_amount, reopened_at: a.reopened_at } : null,
          abort_fee: approved ? a!.approved_amount : null,
          abort_confirmed_at: a?.confirmed_at ?? null,
        }];
      });

      const allRaw = [...(jobsRaw ?? []), ...abortedRows];
      if (!allRaw.length) return [];
      const jobs = await withPricing(allRaw);

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

      // 4b. Evidence inputs. Readiness judges evidence health from the job's
      //    photos, inspections and run id; without them every job looks like it
      //    has no evidence and is wrongly blocked as "evidence issue (red)".
      //    A failed read must not silently pass jobs, so it throws.
      const photosByJob = new Map<string, Photo[]>();
      const inspectionsByJob = new Map<string, Inspection[]>();
      if (jobIds.length > 0) {
        const [photoRes, inspRes] = await Promise.all([
          supabase.from("photos").select("*").in("job_id", jobIds),
          supabase
            .from("inspections")
            .select("*")
            .in("job_id", jobIds)
            .is("archived_at", null),
        ]);
        if (photoRes.error) throw photoRes.error;
        if (inspRes.error) throw inspRes.error;
        for (const p of (photoRes.data ?? []) as unknown as Photo[]) {
          const k = p.job_id;
          (photosByJob.get(k) ?? photosByJob.set(k, []).get(k)!).push(p);
        }
        for (const i of (inspRes.data ?? []) as unknown as Inspection[]) {
          const k = i.job_id;
          (inspectionsByJob.get(k) ?? inspectionsByJob.set(k, []).get(k)!).push(i);
        }
      }

      // 5. Annotate every row with strict invoice readiness so the UI
      //    can render an exact reason badge per row.
      for (const j of clientJobs) {
        j.receiptCount = countMap.get(j.id) ?? 0;
        j.photos = photosByJob.get(j.id) ?? [];
        j.inspections = inspectionsByJob.get(j.id) ?? [];
        j.readiness = evaluateInvoiceReadiness({
          job: j,
          alreadyInvoiced: invoicedIds.has(j.id),
          receiptCount: j.receiptCount,
        });
      }

      // Newest first by the date each job became billable (completion, or the Abort
      // confirmation), so aborted jobs sit among the others instead of at the end.
      const when = (j: EligibleJob) => new Date(j.completed_at ?? j.abort_confirmed_at ?? 0).getTime() || 0;
      return clientJobs.sort((a, b) => when(b) - when(a));
    },
    enabled: !!client,
    staleTime: 15_000,
  });
}
