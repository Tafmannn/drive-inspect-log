/**
 * Attention Center – data fetching hook.
 * Accepts `scope` to filter by org or show all.
 * Fetches acknowledgements to filter dismissed/snoozed exceptions.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  deriveTimingExceptions,
  deriveEvidenceExceptions,
  deriveSyncExceptions,
  deriveStateExceptions,
  deriveComplianceExceptions,
  deriveBillingExceptions,
  deriveStaleUnpricedSummary,
  isGenuineUploadFailure,
  sortExceptions,
  type BillingJobRow,
} from "../engine/exceptionEngine";
import { ATTENTION_THRESHOLDS } from "../config/thresholds";
import { findAlreadyInvoicedJobs } from "@/features/invoicing/api/createInvoice";
import type { AttentionException, AttentionKpiData, AttentionFiltersState } from "../types/exceptionTypes";
import { ACTIVE_STATUSES } from "@/lib/statusConfig";
import type { Tables } from "@/integrations/supabase/types";
import { fetchStaleCompletedJobs } from "../api/staleUnpriced";
import { withPricing } from "@/lib/jobPricingApi";

type JobRow = Tables<"jobs">;

export interface AcknowledgementRow {
  id: string;
  exception_id: string;
  job_id: string | null;
  org_id: string | null;
  acknowledged_by: string;
  note: string | null;
  snoozed_until: string | null;
  created_at: string;
}

interface UseAttentionDataOpts {
  scope: "org" | "all";
  filters: AttentionFiltersState;
}

function buildAckMap(acknowledgements: AcknowledgementRow[]) {
  // Exception IDs are scoped by tenant, including platform-wide views.
  const ackMap = new Map<string, AcknowledgementRow>();
  for (const ack of acknowledgements) {
    if (!ack.org_id) continue;
    const key = JSON.stringify([ack.org_id, ack.exception_id]);
    if (!ackMap.has(key)) ackMap.set(key, ack);
  }

  return ackMap;
}

export async function loadInspections(completedJobs: JobRow[]) {
  // Fetch inspections scoped to completed job IDs
  const completedJobIds = completedJobs.map(j => j.id);
  let inspections: any[] = [];
  if (completedJobIds.length > 0) {
    const chunks: string[][] = [];
    for (let i = 0; i < completedJobIds.length; i += 100) {
      chunks.push(completedJobIds.slice(i, i + 100));
    }
    const results = await Promise.all(
      chunks.map(chunk =>
        (supabase.from("inspections")
          .select("id, job_id, org_id, driver_signature_url, customer_signature_url")
          .in("job_id", chunk) as any)
          .is("archived_at", null)
      )
    );
    for (const r of results) {
      if (r.data) inspections.push(...r.data);
    }
  }

  return inspections;
}

async function loadBilling(billingJobsRes: { data: unknown; error: unknown }) {
  // Billing: throws (→ query error state) rather than raising false
  // "not invoiced" alerts if either lookup fails.
  if (billingJobsRes.error) throw billingJobsRes.error;
  const billingJobs = await withPricing((billingJobsRes.data ?? []) as BillingJobRow[]);
  const staleBillingJobs = await fetchStaleCompletedJobs();
  const billingIds = billingJobs.map((j) => j.id);
  const invoicedJobIds = new Set<string>();
  for (let i = 0; i < billingIds.length; i += 100) {
    for (const id of await findAlreadyInvoicedJobs(billingIds.slice(i, i + 100))) invoicedJobIds.add(id);
  }

  return { billingJobs, staleBillingJobs, invoicedJobIds };
}

export async function loadDriverLookups(docs: { related_type: string; related_id: string }[]) {
  // Driver lookups keyed by driver_profile.id (for documents.related_id):
  //  - name for display
  //  - user_id for routing to /admin/drivers/:userId
  const driverNameByProfileId = new Map<string, string>();
  const driverUserIdByProfileId = new Map<string, string>();
  if (docs.some((d) => d.related_type === "driver")) {
    const driverProfileIds = Array.from(
      new Set(docs.filter((d) => d.related_type === "driver").map((d) => d.related_id))
    );
    if (driverProfileIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("driver_profiles")
        .select("id, user_id, full_name")
        .in("id", driverProfileIds);
      for (const r of profileRows ?? []) {
        if (r.full_name) driverNameByProfileId.set(r.id, r.full_name);
        if (r.user_id) driverUserIdByProfileId.set(r.id, r.user_id);
      }
    }
  }

  return { driverNameByProfileId, driverUserIdByProfileId };
}

function activeAck(ack: AcknowledgementRow | undefined, now: string): boolean {
  return !!ack && (!ack.snoozed_until || ack.snoozed_until > now);
}

function evidenceAckKeys(acknowledgements: AcknowledgementRow[], now: string) {
  const keys = new Set<string>();
  for (const ack of acknowledgements) {
    if (ack.job_id && ack.org_id && ack.exception_id === "evidence:" + ack.job_id && activeAck(ack, now)) {
      keys.add(JSON.stringify([ack.org_id, ack.job_id]));
    }
  }
  return keys;
}

export function partitionAttentionExceptions(allExceptions: AttentionException[], acknowledgements: AcknowledgementRow[], now: string) {
  const ackMap = buildAckMap(acknowledgements);
  const evidenceKeys = evidenceAckKeys(acknowledgements, now);
  const activeExceptions: AttentionException[] = [];
  const acknowledgedExceptions: AttentionException[] = [];
  for (const ex of allExceptions) {
    const ack = ex.orgId ? ackMap.get(JSON.stringify([ex.orgId, ex.id])) : undefined;
    const evidenceResolved = ex.category === "evidence" && !!ex.jobId && !!ex.orgId && evidenceKeys.has(JSON.stringify([ex.orgId, ex.jobId]));
    (evidenceResolved || activeAck(ack, now) ? acknowledgedExceptions : activeExceptions).push(ex);
  }
  return { activeExceptions, acknowledgedExceptions, ackMap };
}

export function filterExceptions(activeExceptions: AttentionException[], filters: AttentionFiltersState, scope: UseAttentionDataOpts["scope"]) {
  let exceptions = activeExceptions;

  // Apply filters
  if (filters.severity !== "all") {
    exceptions = exceptions.filter(e => e.severity === filters.severity);
  }
  if (filters.category !== "all") {
    exceptions = exceptions.filter(e => e.category === filters.category);
  }
  if (filters.orgId !== "all" && scope === "all") {
    exceptions = exceptions.filter(e => e.orgId === filters.orgId);
  }
  if (filters.dateFrom) {
    exceptions = exceptions.filter(e => e.createdAt >= filters.dateFrom);
  }
  if (filters.dateTo) {
    exceptions = exceptions.filter(e => e.createdAt <= filters.dateTo + "T23:59:59");
  }

  return exceptions;
}

export function useAttentionData({ scope, filters }: UseAttentionDataOpts) {
  return useQuery({
    queryKey: ["attention-center", scope, filters],
    queryFn: async () => {
      const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00";
      const now = new Date().toISOString();

      const [
        activeJobsRes,
        completedJobsRes,
        logEntriesRes,
        orgsRes,
        acksRes,
        docsRes,
        driversRes,
        billingJobsRes,
      ] = await Promise.all([
        supabase.from("jobs").select("*")
          .eq("is_hidden", false)
          .in("status", ["ready_for_pickup", "assigned", "pickup_in_progress", "delivery_in_progress", "pod_ready"])
          .order("updated_at", { ascending: false })
          .limit(500),

        supabase.from("jobs").select("*")
          .eq("is_hidden", false)
          .in("status", ["completed", "delivery_complete", "pod_ready"])
          .gte("updated_at", new Date(Date.now() - 7 * 86400_000).toISOString())
          .limit(500),

        supabase.from("client_logs").select("event, job_id, created_at, context, severity")
          .in("event", [
            "signature_resolve_failed",
            "photo_upload_failed",
            "upload_failed",
            "blocked_status_transition",
            "blocked_inspection_resubmit",
            "duplicate_job_skipped",
          ])
          .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
          .order("created_at", { ascending: false })
          .limit(500),

        scope === "all"
          ? supabase.from("organisations").select("id, name")
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),

        // Fetch acknowledgements
        supabase.from("attention_acknowledgements").select("*")
          .order("created_at", { ascending: false })
          .limit(1000),

        // Onboarding documents with expiry within next 60d or already expired
        supabase.from("onboarding_documents")
          .select("id, related_type, related_id, document_type, expires_at, org_id")
          .not("expires_at", "is", null)
          .lte("expires_at", new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10))
          .limit(500),

        // Active drivers for compliance gap detection
        supabase.from("driver_profiles")
          .select("user_id, full_name, org_id, licence_expiry, right_to_work, bank_captured, is_active, archived_at")
          .is("archived_at", null)
          .eq("is_active", true)
          .limit(500),

        // Completed work inside the billing lookback, for unpriced /
        // unlinked / uninvoiced checks.
        supabase.from("jobs")
          .select("id, org_id, external_job_number, vehicle_reg, status, completed_at, client_id")
          .eq("is_hidden", false)
          .eq("is_test", false)
          .in("status", ["completed", "closed"])
          .gte("completed_at", new Date(Date.now() - ATTENTION_THRESHOLDS.billingLookbackDays * 86400_000).toISOString())
          .limit(1000),
      ]);

      const activeJobs = (activeJobsRes.data ?? []) as JobRow[];
      const completedJobs = (completedJobsRes.data ?? []) as JobRow[];
      const logEntries = (logEntriesRes.data ?? []) as any[];
      const orgs = (orgsRes as any).data ?? [];
      if (acksRes.error) throw acksRes.error;
      const acknowledgements = (acksRes.data ?? []) as AcknowledgementRow[];
      const docs = (docsRes.data ?? []) as any[];
      const drivers = (driversRes.data ?? []) as any[];

      const inspections = await loadInspections(completedJobs);

      const { billingJobs, staleBillingJobs, invoicedJobIds } = await loadBilling(billingJobsRes);

      const orgLookup = new Map<string, string>();
      for (const o of orgs) orgLookup.set(o.id, o.name);

      const { driverNameByProfileId, driverUserIdByProfileId } = await loadDriverLookups(docs);

      // Derive all exceptions
      const allExceptions: AttentionException[] = sortExceptions([
        ...deriveTimingExceptions(activeJobs, orgLookup),
        ...deriveEvidenceExceptions(completedJobs, inspections, logEntries, orgLookup),
        ...deriveSyncExceptions(logEntries),
        ...deriveStateExceptions(logEntries),
        ...deriveComplianceExceptions(
          docs,
          drivers,
          driverNameByProfileId,
          orgLookup,
          driverUserIdByProfileId,
        ),
        ...deriveBillingExceptions(billingJobs, invoicedJobIds, orgLookup),
        ...deriveStaleUnpricedSummary(staleBillingJobs, orgLookup),
      ]);

      const { activeExceptions, acknowledgedExceptions, ackMap } = partitionAttentionExceptions(allExceptions, acknowledgements, now);

      const exceptions = filterExceptions(activeExceptions, filters, scope);

      // KPIs (based on active only)
      const allActiveCount = (await supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[])).count ?? 0;
      const uploadFailuresToday = logEntries.filter(l =>
        isGenuineUploadFailure(l) && l.created_at >= todayStart
      ).length;

      const kpis: AttentionKpiData = {
        activeJobs: allActiveCount,
        highSeverity: exceptions.filter(e => e.severity === "critical" || e.severity === "high").length,
        missingSignatures: exceptions.filter(e => e.title.includes("Missing") && e.title.includes("signature")).length,
        uploadFailuresToday,
      };

      return {
        exceptions,
        acknowledgedExceptions,
        acknowledgedCount: acknowledgedExceptions.length,
        kpis,
        orgs,
        ackMap,
      };
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}
