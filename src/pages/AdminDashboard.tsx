/**
 * Admin Dashboard — Intervention-First Operational Surface
 *
 * Presentation (2026-11 refresh, UI only): KPI tiles → state-driven attention
 * banner → ranked Needs Action queue → job pipeline → operations / driver
 * compliance → queue snapshots → recently updated jobs → management links →
 * all operational buckets. Visual building blocks live in
 * features/admin-home/components.tsx.
 *
 * Data contract: every number comes from the existing hooks
 * (useAdminJobQueueKpis, useAdminJobQueues, useAdminOperationsBuckets,
 * useAdminMissingEvidence, useAdminComplianceCounts, useAttentionData). A count
 * that could not be loaded is `null` and is shown as "—", never as 0; an
 * unknown count never raises a banner. No figures are derived, summed across
 * overlapping buckets, or invented.
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useEvidenceAckRealtime } from "@/hooks/useEvidenceAckRealtime";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UKPlate } from "@/components/UKPlate";
import { useAuth } from "@/context/AuthContext";
import { useAdminJobQueues, useAdminJobQueueKpis } from "@/hooks/useAdminJobQueues";
import { useAdminMissingEvidence, useAdminComplianceCounts } from "@/hooks/useAdminDashboardData";
import { useAdminOperationsBuckets } from "@/hooks/useAdminOperationsBuckets";
import { BUCKET_DEFS, type BucketKey, type BucketPriority } from "@/lib/operationsBuckets";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import { KpiPill } from "@/components/KpiPill";
import { AssignDriverModal } from "@/features/control/components/AssignDriverModal";
import { getStatusStyle } from "@/lib/statusConfig";
import { humanAge, isJobStale, isUnassigned } from "@/features/control/pages/jobs/jobsUtils";
import type { AdminJobRow } from "@/components/AdminJobCard";
import type { AttentionFiltersState } from "@/features/attention/types/exceptionTypes";
import { cn } from "@/lib/utils";
import {
  AttentionBanner, BannerSkeleton, Card, Chip, CountRow, EmptyLine,
  KpiTile, NoticeCard, QueueStrip, SectionHeader, type Tone,
} from "@/features/admin-home/components";
import {
  UserX, Clock, FileSearch, ImageOff, Zap, Eye, UserPlus, MapPin, AlertTriangle, User,
  Truck, Users, ClipboardCheck, ReceiptPoundSterling as Receipt, Globe, CheckCircle2, FileText, Layers, Route,
  ShieldCheck, FileWarning, IdCard, History, LayoutGrid, ChevronRight, ListChecks, Activity,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

interface NeedsActionItem {
  key: string;
  priority: number; // lower = more urgent
  updatedAtMs: number; // raw timestamp for sorting (older = smaller = more urgent)
  queueType: "unassigned" | "stale" | "evidence" | "pod_review";
  queueLabel: string;
  jobId?: string;
  jobRef?: string;
  title?: string; // exception headline (evidence items have no vehicle/route)
  detail?: string;
  vehicleReg?: string;
  route?: string; // compressed route
  age: string;
  driverId?: string | null;
  resolvedDriverName?: string | null;
  status?: string;
  actionLabel: string;
  actionRoute: string;
}

// KpiPill lives in its own module so the eager driver home can reuse it
// without pulling this heavy admin dashboard into the initial bundle.
// Re-exported here so existing `@/pages/AdminDashboard` importers stay stable.
export { KpiPill };

/** "IN PROGRESS" → "In progress" (display only; the status value is untouched). */
function sentenceCase(label: string): string {
  const s = label.toLowerCase();
  return s.replace(/\bpod\b/g, "POD").replace(/^./, (c) => c.toUpperCase());
}

// ── Needs Action items (ranking logic unchanged, shared with the banner) ──

const NEEDS_ACTION_FILTERS: AttentionFiltersState = { severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "" };

function useNeedsActionItems() {
  const queuesQuery = useAdminJobQueues();
  const attentionQuery = useAttentionData({ scope: "org", filters: NEEDS_ACTION_FILTERS });
  const { data: queues, isLoading: queuesLoading } = queuesQuery;
  const { data: attentionData, isLoading: attentionLoading } = attentionQuery;

  const loading = queuesLoading || attentionLoading;

  const items = useMemo(() => {
    const result: NeedsActionItem[] = [];

    // Priority 1: Unassigned jobs (blocked)
    for (const job of (queues?.unassigned ?? [])) {
      result.push({
        key: `unassigned-${job.id}`,
        priority: 1,
        updatedAtMs: new Date(job.updated_at).getTime(),
        queueType: "unassigned",
        queueLabel: "Unassigned",
        jobId: job.id,
        jobRef: job.external_job_number || job.id.slice(0, 8),
        vehicleReg: job.vehicle_reg,
        route: `${job.pickup_postcode} → ${job.delivery_postcode}`,
        age: humanAge(job.updated_at),
        driverId: job.driver_id,
        resolvedDriverName: job.resolvedDriverName,
        status: job.status,
        actionLabel: "Assign",
        actionRoute: `/jobs/${job.id}`,
      });
    }

    // Priority 2: Stale active jobs (not already in unassigned)
    const unassignedIds = new Set(result.map(r => r.jobId));
    for (const job of (queues?.needsAttention ?? [])) {
      if (unassignedIds.has(job.id)) continue;
      if (!isJobStale(job)) continue;
      result.push({
        key: `stale-${job.id}`,
        priority: 2,
        updatedAtMs: new Date(job.updated_at).getTime(),
        queueType: "stale",
        queueLabel: "Stale",
        jobId: job.id,
        jobRef: job.external_job_number || job.id.slice(0, 8),
        vehicleReg: job.vehicle_reg,
        route: `${job.pickup_postcode} → ${job.delivery_postcode}`,
        age: humanAge(job.updated_at),
        driverId: job.driver_id,
        resolvedDriverName: job.resolvedDriverName,
        status: job.status,
        actionLabel: "View",
        actionRoute: `/jobs/${job.id}`,
      });
    }

    // Priority 3: High-severity evidence exceptions
    const highExceptions = (attentionData?.exceptions ?? []).filter(
      e => (e.severity === "critical" || e.severity === "high") && e.category === "evidence"
    );
    for (const ex of highExceptions.slice(0, 5)) {
      result.push({
        key: `evidence-${ex.id}`,
        priority: 3,
        updatedAtMs: new Date(ex.createdAt).getTime(),
        queueType: "evidence",
        queueLabel: "Evidence",
        jobRef: ex.jobNumber ?? undefined,
        title: ex.title,
        detail: ex.detail,
        age: humanAge(ex.createdAt),
        actionLabel: ex.actionLabel || "Review",
        actionRoute: ex.actionRoute,
      });
    }

    // Priority 4: POD review backlog
    for (const job of (queues?.review ?? [])) {
      result.push({
        key: `pod-${job.id}`,
        priority: 4,
        updatedAtMs: new Date(job.updated_at).getTime(),
        queueType: "pod_review",
        queueLabel: "POD review",
        jobId: job.id,
        jobRef: job.external_job_number || job.id.slice(0, 8),
        vehicleReg: job.vehicle_reg,
        route: `${job.pickup_postcode} → ${job.delivery_postcode}`,
        age: humanAge(job.updated_at),
        driverId: job.driver_id,
        resolvedDriverName: job.resolvedDriverName,
        status: job.status,
        actionLabel: "Review POD",
        actionRoute: `/jobs/${job.id}/pod`,
      });
    }

    // Sort: priority band first, then oldest-first within same band (deterministic)
    result.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.updatedAtMs - b.updatedAtMs; // older items surface first
    });

    return result;
  }, [queues, attentionData]);

  // Query state only (no new requests): lets the UI tell an empty queue apart
  // from one that failed to load, and say when the data was fetched.
  const failed = queuesQuery.isError || attentionQuery.isError;
  const retry = () => {
    void queuesQuery.refetch();
    void attentionQuery.refetch();
  };
  const updatedAt = queuesQuery.dataUpdatedAt;

  return { items, loading, failed, retry, updatedAt };
}

const NEEDS_ACTION_ID = "needs-action";

// ── Tier 1: KPI tiles (operational; finance lives in InvoicingCard) ───
// Labels describe exactly what each count measures (see docs/admin-home).

function KpiTiles() {
  const navigate = useNavigate();
  const { data: kpis, isLoading } = useAdminJobQueueKpis();

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
      <KpiTile
        label="Active jobs"
        value={kpis?.active ?? null}
        icon={Truck}
        tone="info"
        loading={isLoading}
        onClick={() => navigate("/control/jobs?view=active")}
      />
      <KpiTile
        label="Unassigned"
        value={kpis?.unassigned ?? null}
        icon={UserX}
        tone="danger"
        attention
        loading={isLoading}
        onClick={() => navigate("/control/jobs?view=unassigned")}
      />
      <KpiTile
        label="POD review"
        value={kpis?.podReview ?? null}
        icon={FileSearch}
        tone="warning"
        attention
        loading={isLoading}
        onClick={() => navigate("/control/pod-review")}
      />
      <KpiTile
        label="Stale jobs"
        value={kpis?.stale ?? null}
        icon={Clock}
        tone="warning"
        attention
        loading={isLoading}
        onClick={() => navigate("/control/jobs?view=stale")}
      />
    </div>
  );
}

// ── Attention banner (driven entirely by existing state) ─────────────

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

function AttentionSummary() {
  const { items, loading, failed, retry, updatedAt } = useNeedsActionItems();
  const bucketsQuery = useAdminOperationsBuckets();
  const kpisQuery = useAdminJobQueueKpis();
  const { data: buckets, isLoading: bucketsLoading } = bucketsQuery;
  // Any count that could not be loaded (null, or the whole query failed).
  const countsIncomplete =
    bucketsQuery.isError || kpisQuery.isError ||
    Object.values(kpisQuery.data ?? {}).some((v) => v === null) ||
    Object.entries(buckets ?? {}).some(([k, v]) => k !== "failed_uploads" && v === null);

  const scrollToQueue = useCallback(() => {
    const el = document.getElementById(NEEDS_ACTION_ID);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const heading = el.querySelector<HTMLElement>("h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }, []);

  if (loading || bucketsLoading) return <BannerSkeleton />;

  // A failed queue load must never read as "nothing to do".
  if (failed) {
    return (
      <NoticeCard
        icon={AlertTriangle}
        tone="warning"
        title="Some queues didn’t load"
        message="Counts below may be incomplete."
        action={{ label: "Try again", onClick: retry }}
      />
    );
  }

  if (items.length > 0) {
    const count = (t: NeedsActionItem["queueType"]) => items.filter((i) => i.queueType === t).length;
    const parts = [
      count("unassigned") && plural(count("unassigned"), "unassigned", "unassigned"),
      count("stale") && plural(count("stale"), "stale", "stale"),
      count("evidence") && plural(count("evidence"), "evidence issue", "evidence issues"),
      count("pod_review") && plural(count("pod_review"), "POD to review", "PODs to review"),
    ].filter(Boolean) as string[];
    return (
      <AttentionBanner
        icon={AlertTriangle}
        title="Needs your attention"
        message={parts}
        actionLabel="Review"
        onAction={scrollToQueue}
      />
    );
  }

  // The banner summarises the Needs action queue only, so it can never
  // disagree with it. Invoicing has its own section (InvoicingCard).

  // Don't reassure while some counts are unknown.
  if (countsIncomplete) {
    return (
      <NoticeCard
        icon={AlertTriangle}
        tone="warning"
        title="Some counts didn’t load"
        message="Figures shown as — are unavailable."
        action={{
          label: "Try again",
          onClick: () => {
            void bucketsQuery.refetch();
            void kpisQuery.refetch();
          },
        }}
      />
    );
  }

  return (
    <NoticeCard
      icon={CheckCircle2}
      tone="success"
      title="Action queue is empty"
      message={`No unassigned, stale, evidence or POD items${updatedAt ? ` at ${timeFmt.format(updatedAt)}` : ""}.`}
    />
  );
}

// ── Tier 2: Ranked Needs Action Queue ────────────────────────────────

const QUEUE_CHIP: Record<NeedsActionItem["queueType"], string> = {
  unassigned: "bg-[hsl(var(--danger-soft))] text-destructive",
  stale: "bg-[hsl(var(--warning-soft))] text-warning",
  evidence: "bg-[hsl(var(--danger-soft))] text-destructive",
  pod_review: "bg-[hsl(var(--primary-soft))] text-primary",
};

const ACTION_BTN = "ml-auto min-h-11 shrink-0 rounded-full px-3.5 text-[14px] font-semibold ah-press [&_svg]:max-[439px]:hidden";

function NeedsActionQueue() {
  const navigate = useNavigate();
  const { items, loading } = useNeedsActionItems();
  const [assignTarget, setAssignTarget] = useState<{ jobId: string; jobRef: string; driverId: string | null } | null>(null);

  // Empty queue: the status banner above already says "Action queue is
  // empty" (it summarises this exact queue), so don't repeat it in a card.
  if (!loading && items.length === 0) return null;

  return (
    <Card aria-labelledby={`${NEEDS_ACTION_ID}-title`}>
      <div id={NEEDS_ACTION_ID} className="scroll-mt-4">
        <SectionHeader
          id={`${NEEDS_ACTION_ID}-title`}
          icon={Zap}
          title="Needs action"
          count={loading ? undefined : items.length}
          countTone="danger"
        />
      </div>

      {loading ? (
        <div className="space-y-2 px-4 pb-4 sm:px-5">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[76px] w-full rounded-xl" />)}
        </div>
      ) : (
        <ul className="ah-divide pb-1">
          {items.map(item => (
            <li
              key={item.key}
              className="ah-row flex flex-wrap items-center gap-x-3 px-4 pb-2.5 min-[380px]:flex-nowrap min-[380px]:pb-0 sm:px-5"
            >
              {/* Row content is its own button (keyboard reachable, no nested controls). */}
              <button
                type="button"
                onClick={() => navigate(item.actionRoute)}
                className="min-w-0 flex-1 basis-full space-y-1 py-2.5 text-left min-[380px]:basis-auto"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Chip className={QUEUE_CHIP[item.queueType]}>{item.queueLabel}</Chip>
                  {item.jobRef && (
                    <span className="ah-num ah-ref min-w-0 truncate text-[13px] text-muted-foreground">{item.jobRef}</span>
                  )}
                  <span className="ah-num ml-auto shrink-0 text-[13px] text-muted-foreground">{item.age}</span>
                </span>

                <span className="flex min-w-0 items-center gap-2">
                  {item.vehicleReg && <span className="inline-flex shrink-0"><UKPlate size="compact" reg={item.vehicleReg} /></span>}
                  {item.route && (
                    <span className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
                      <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{item.route}</span>
                    </span>
                  )}
                  {!item.vehicleReg && !item.route && (
                    <span className="text-[15px] font-medium leading-5 text-foreground line-clamp-2">
                      {item.title ?? item.jobRef}
                    </span>
                  )}
                </span>
                {item.detail && !item.vehicleReg && !item.route && (
                  <span className="block truncate text-[13px] text-muted-foreground">{item.detail}</span>
                )}

                {item.jobId && (
                  item.resolvedDriverName ? (
                    <span className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
                      <User aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{item.resolvedDriverName}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[13px] font-medium text-warning">
                      <AlertTriangle aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} /> Unassigned
                    </span>
                  )
                )}
              </button>

              <Button
                size="sm"
                variant={item.queueType === "unassigned" ? "default" : "outline"}
                className={cn(
                  ACTION_BTN,
                  item.queueType === "unassigned" && "bg-warning text-warning-foreground hover:bg-warning/90",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.queueType === "unassigned" && item.jobId) {
                    setAssignTarget({
                      jobId: item.jobId,
                      jobRef: item.jobRef ?? "",
                      driverId: item.driverId ?? null,
                    });
                  } else {
                    navigate(item.actionRoute);
                  }
                }}
              >
                {item.queueType === "unassigned" && <UserPlus aria-hidden className="mr-1 h-4 w-4" />}
                {item.queueType === "pod_review" && <ClipboardCheck aria-hidden className="mr-1 h-4 w-4" />}
                {item.actionLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {assignTarget && (
        <AssignDriverModal
          open={!!assignTarget}
          onOpenChange={(open) => { if (!open) setAssignTarget(null); }}
          jobId={assignTarget.jobId}
          jobRef={assignTarget.jobRef}
          currentDriverId={assignTarget.driverId}
        />
      )}
    </Card>
  );
}

// ── Operations: job queues + exceptions (independent counts, not a sequence) ──

function OperationsCard() {
  const navigate = useNavigate();
  const { data: buckets, isLoading } = useAdminOperationsBuckets();
  const { data: missingEvidence, isLoading: evidenceLoading } = useAdminMissingEvidence();
  // Each count matches the list its destination shows. "Missing inspection"
  // uses the 7-day count (useAdminMissingEvidence) because /control/jobs
  // ?view=evidence lists that 7-day queue; the all-time bucket
  // (blocked_evidence) stays under "All operational buckets".
  return (
    <Card aria-labelledby="ops-title">
      <SectionHeader
        id="ops-title"
        icon={Activity}
        title="Operations"
        action={{ label: "All jobs", onClick: () => navigate("/control/jobs"), ariaLabel: "Open the full jobs queue" }}
      />
      <QueueStrip
        loading={isLoading || evidenceLoading}
        stats={[
          {
            key: "needs_driver_action",
            label: "With drivers",
            hint: "Assigned to delivery",
            value: buckets ? buckets.needs_driver_action : null,
            onClick: () => navigate(BUCKET_DEFS.needs_driver_action.defaultRoute!),
          },
          {
            key: "todays_active",
            label: "Due today",
            hint: "Job date today",
            value: buckets ? buckets.todays_active : null,
            onClick: () => navigate(BUCKET_DEFS.todays_active.defaultRoute!),
          },
          {
            key: "missing_inspection",
            label: "Missing inspection",
            hint: "Delivered, last 7 days",
            tone: "danger",
            value: missingEvidence ?? null,
            onClick: () => navigate("/control/jobs?view=evidence"),
          },
        ]}
      />
    </Card>
  );
}

// ── Invoicing (counts checked against invoices; see useAdminOperationsBuckets) ──

function InvoicingCard() {
  const navigate = useNavigate();
  const { data: buckets, isLoading } = useAdminOperationsBuckets();
  const ready = buckets?.ready_to_invoice ?? null;
  const notInvoiced = buckets?.completed_not_invoiced ?? null;
  // ready_to_invoice is a strict subset of completed_not_invoiced (same live,
  // completed, uninvoiced base plus client, price and both inspections), so
  // the difference is the jobs that cannot be invoiced yet. Unknown if either is.
  const blocked = ready === null || notInvoiced === null ? null : Math.max(notInvoiced - ready, 0);
  return (
    <Card aria-labelledby="invoicing-title">
      <SectionHeader
        id="invoicing-title"
        icon={Receipt}
        title="Invoicing"
        action={{ label: "Invoice prep", onClick: () => navigate("/control/invoice-prep"), ariaLabel: "Open invoice preparation" }}
      />
      <div className="ah-divide pb-1">
        <CountRow
          icon={FileText}
          label="Ready to invoice"
          hint="Client, price and both inspections"
          tone="info"
          value={ready}
          loading={isLoading}
          onClick={() => navigate(BUCKET_DEFS.ready_to_invoice.defaultRoute!)}
        />
        <CountRow
          icon={FileWarning}
          label="Can’t invoice yet"
          hint="Completed, but missing a client, price or inspection"
          tone="warning"
          value={blocked}
          loading={isLoading}
          onClick={() => navigate("/control/clients/link-jobs")}
        />
      </div>
    </Card>
  );
}

// ── Driver compliance (was the compliance strip) ─────────────────────

function ComplianceCard() {
  const navigate = useNavigate();
  const { data: counts, isLoading } = useAdminComplianceCounts();
  const go = () => navigate("/admin/onboarding");
  return (
    <Card aria-labelledby="compliance-title">
      <SectionHeader
        id="compliance-title"
        icon={ShieldCheck}
        title="Driver compliance"
        action={{ label: "Onboarding", onClick: go, ariaLabel: "Open driver onboarding" }}
      />
      <div className="ah-divide pb-1">
        <CountRow icon={ListChecks} label="Pending review" tone="warning" value={counts?.pendingReview ?? null} loading={isLoading} onClick={go} />
        <CountRow icon={FileWarning} label="Missing documents" tone="danger" value={counts?.missingDocs ?? null} loading={isLoading} onClick={go} />
        <CountRow icon={IdCard} label="Expired licences" tone="warning" value={counts?.expiredLicences ?? null} loading={isLoading} onClick={go} />
      </div>
    </Card>
  );
}

// ── Tier 3: Live Operational Queue Previews ──────────────────────────

function CompactJobRow({
  job,
  onView,
  onAssign,
}: {
  job: AdminJobRow;
  onView: () => void;
  onAssign: () => void;
}) {
  const statusStyle = getStatusStyle(job.status);
  const stale = isJobStale(job);
  const unassigned = isUnassigned(job);

  return (
    <li className="ah-row flex flex-wrap items-center gap-x-3 px-4 pb-2.5 min-[380px]:flex-nowrap min-[380px]:pb-0 sm:px-5">
      <button type="button" onClick={onView} className="min-w-0 flex-1 basis-full space-y-1 py-2.5 text-left min-[380px]:basis-auto">
        <span className="flex min-w-0 items-center gap-2">
          <Chip style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}>
            {sentenceCase(statusStyle.label)}
          </Chip>
          <span className="ah-num ah-ref min-w-0 truncate text-[13px] text-muted-foreground">
            {job.external_job_number || job.id.slice(0, 8)}
          </span>
          {stale && (
            <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-warning">
              <Clock aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} /> Stale
            </span>
          )}
          <span className="ah-num ml-auto shrink-0 text-[13px] text-muted-foreground">{humanAge(job.updated_at)}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0"><UKPlate size="compact" reg={job.vehicle_reg} /></span>
          <span className="truncate text-[13px] text-muted-foreground">
            {job.pickup_postcode} → {job.delivery_postcode}
          </span>
        </span>
        {unassigned ? (
          <span className="flex items-center gap-1 text-[13px] font-medium text-warning">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} /> Unassigned
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
            <User aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{job.resolvedDriverName}</span>
          </span>
        )}
      </button>

      {/* One dominant action */}
      {unassigned ? (
        <Button
          size="sm"
          className={cn(ACTION_BTN, "bg-warning text-warning-foreground hover:bg-warning/90")}
          onClick={(e) => { e.stopPropagation(); onAssign(); }}
        >
          <UserPlus aria-hidden className="mr-1 h-4 w-4" /> Assign
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className={ACTION_BTN}
          onClick={(e) => { e.stopPropagation(); onView(); }}
        >
          <Eye aria-hidden className="mr-1 h-4 w-4" /> View
        </Button>
      )}
    </li>
  );
}

function QueuePreviewSection({
  title,
  icon,
  count,
  items,
  loading,
  emptyText,
  onViewAll,
}: {
  title: string;
  icon: typeof Clock;
  count?: number;
  items: AdminJobRow[];
  loading: boolean;
  emptyText: string;
  onViewAll: () => void;
}) {
  const navigate = useNavigate();
  const [assignTarget, setAssignTarget] = useState<{ jobId: string; jobRef: string; driverId: string | null } | null>(null);

  const displayCount = count ?? items.length;

  return (
    <Card>
      <SectionHeader
        icon={icon}
        title={title}
        count={loading ? undefined : displayCount}
        action={{ label: "View all", onClick: onViewAll, ariaLabel: `View all: ${title}` }}
      />

      {loading ? (
        <div className="space-y-2 px-4 pb-4 sm:px-5">
          {[1, 2].map(i => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyLine>{emptyText}</EmptyLine>
      ) : (
        <ul className="ah-divide pb-1">
          {items.slice(0, 3).map(job => (
            <CompactJobRow
              key={job.id}
              job={job}
              onView={() => navigate(`/jobs/${job.id}`)}
              onAssign={() => setAssignTarget({
                jobId: job.id,
                jobRef: job.external_job_number || job.id.slice(0, 8),
                driverId: job.driver_id,
              })}
            />
          ))}
        </ul>
      )}

      {assignTarget && (
        <AssignDriverModal
          open={!!assignTarget}
          onOpenChange={(open) => { if (!open) setAssignTarget(null); }}
          jobId={assignTarget.jobId}
          jobRef={assignTarget.jobRef}
          currentDriverId={assignTarget.driverId}
        />
      )}
    </Card>
  );
}

// ── Recently updated jobs (from the admin queues already loaded) ─────

function RecentActivity() {
  const navigate = useNavigate();
  const { data: queues, isLoading } = useAdminJobQueues();

  const rows = useMemo(() => {
    if (!queues) return [];
    const seen = new Map<string, AdminJobRow>();
    for (const list of [queues.unassigned, queues.needsAttention, queues.inProgress, queues.review, queues.completed, queues.missingEvidence]) {
      for (const j of list ?? []) if (!seen.has(j.id)) seen.set(j.id, j);
    }
    return [...seen.values()]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 4);
  }, [queues]);

  return (
    <Card aria-labelledby="recent-title">
      <SectionHeader
        id="recent-title"
        icon={History}
        title="Recently updated"
        action={{ label: "All jobs", onClick: () => navigate("/control/jobs"), ariaLabel: "Open the full jobs queue" }}
      />
      {isLoading ? (
        <div className="space-y-2 px-4 pb-4 sm:px-5">
          {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyLine>No recent job updates.</EmptyLine>
      ) : (
        <ul className="ah-divide pb-1">
          {rows.map((job) => {
            const st = getStatusStyle(job.status);
            return (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className="ah-row flex w-full min-h-[60px] items-center gap-3 px-4 py-2.5 text-left sm:px-5"
                >
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-[hsl(var(--muted))]" style={{ backgroundColor: st.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate text-[15px] font-medium leading-5 text-foreground">{sentenceCase(st.label)}</span>
                      <span className="ah-num ml-auto shrink-0 text-[13px] text-muted-foreground">{humanAge(job.updated_at)}</span>
                    </span>
                    <span className="ah-num block truncate text-[13px] leading-[18px] text-muted-foreground">
                      {job.external_job_number || job.id.slice(0, 8)} · {job.vehicle_reg} · {job.pickup_postcode} → {job.delivery_postcode}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground/70" strokeWidth={2} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── All operations buckets (every bucket and route kept, folded) ─────

const BUCKET_ORDER: BucketKey[] = [
  "todays_active",
  "needs_driver_action",
  "needs_admin_review",
  "blocked_evidence",
  "ready_to_close",
  "ready_to_invoice",
  "completed_not_invoiced",
  "failed_uploads",
  "cancelled_archived",
];

/**
 * Display-only wording where the library label would overstate the data.
 * failed_uploads is not recorded centrally (the hook returns null), so the
 * row explains where to look instead of showing a count.
 */
const BUCKET_DISPLAY: Partial<Record<BucketKey, { label: string; hint: string }>> = {
  failed_uploads: {
    label: "Jobs with failed uploads",
    hint: "Not counted here. Failed uploads are held on each device; open Pending uploads.",
  },
};

const PRIORITY_TONE: Record<BucketPriority, Tone> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

function OperationsBuckets() {
  const navigate = useNavigate();
  const { data: counts, isLoading } = useAdminOperationsBuckets();

  return (
    <details className="ah-card ah-details overflow-hidden">
      <summary className="ah-row flex min-h-[60px] cursor-pointer items-center gap-2 px-4 sm:px-5">
        <LayoutGrid aria-hidden className="h-[18px] w-[18px] shrink-0 text-foreground/70" strokeWidth={1.75} />
        <span className="flex-1 text-[17px] font-semibold tracking-[-0.012em] text-foreground">All operational buckets</span>
        <ChevronRight aria-hidden className="ah-chevron h-4 w-4 text-muted-foreground" strokeWidth={2} />
      </summary>
      <div className="ah-divide border-t border-[hsl(var(--ah-hairline))] pb-1.5 md:grid md:grid-cols-2 md:[&>*+*]:border-t-0 md:[&>*]:border-b md:[&>*]:border-[hsl(var(--ah-hairline))]">
        {BUCKET_ORDER.map((key) => {
          const def = BUCKET_DEFS[key];
          // null = could not be counted (or not counted centrally); shown as "—".
          const value = counts ? (counts as Partial<Record<BucketKey, number | null>>)[key] ?? null : null;
          return (
            <CountRow
              key={key}
              icon={key === "cancelled_archived" ? FileText : key === "failed_uploads" ? AlertTriangle : Layers}
              label={BUCKET_DISPLAY[key]?.label ?? def.label}
              hint={BUCKET_DISPLAY[key]?.hint ?? def.reason}
              tone={PRIORITY_TONE[def.priority]}
              value={value}
              loading={isLoading}
              onClick={def.defaultRoute ? () => navigate(def.defaultRoute!) : undefined}
            />
          );
        })}
      </div>
    </details>
  );
}

// ── Tier 4: Management Routes ────────────────────────────────────────

function ManagementRoutes() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();

  const routes = [
    { label: "Full jobs queue", icon: Truck, path: "/control/jobs" },
    { label: "Fleet & drivers", icon: Users, path: "/control/drivers" },
    { label: "Driver onboarding", icon: ClipboardCheck, path: "/admin/onboarding" },
    { label: "POD closure", icon: ClipboardCheck, path: "/control/pod-review" },
    { label: "Expenses & finance", icon: Receipt, path: "/control/finance" },
    // Super Admins reach the global console here — a neutral globe, not a red
    // shield (red read as an error state on the old dashboard).
    ...(isSuperAdmin
      ? [{ label: "Super Admin console", icon: Globe, path: "/super-admin" }]
      : []),
  ];

  return (
    <Card aria-labelledby="mgmt-title">
      <SectionHeader id="mgmt-title" icon={LayoutGrid} title="Management" />
      <div className="ah-divide pb-1.5">
        {routes.map(r => (
          <CountRow key={r.path} icon={r.icon} label={r.label} tone="info" onClick={() => navigate(r.path)} />
        ))}
      </div>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

/**
 * The operational dashboard body, without any page chrome (no AppHeader /
 * BottomNav). Backs BOTH the `/admin` route and the role-aware home screen
 * (`/`). Owns its own data hooks and the focus/realtime refresh wiring so
 * both mount points behave identically.
 *
 * Layout: one column on phones (DOM order via `order-*` through
 * `display: contents` wrappers); two columns from `lg`.
 */
export function AdminDashboardBody() {
  const navigate = useNavigate();
  const { data: queues, isLoading } = useAdminJobQueues();

  // Refresh every admin queue on tab focus / bfcache restore so returning
  // from a Job Detail / POD Report screen shows the post-mutation state
  // even when no React lifecycle event fires (iOS Safari swipe-back).
  useRefetchOnFocus([
    ["jobs", "admin", "queues"],
    ["jobs", "admin", "queue-kpis"],
    ["admin-operations-buckets"],
    ["admin-missing-evidence-count"],
    ["admin-compliance-counts"],
    ["admin-pod-review"],
    ["attention-center"],
  ]);
  // Live updates when evidence acks change in any tab/admin session.
  useEvidenceAckRealtime();

  const staleItems = (queues?.needsAttention ?? []).filter(j => isJobStale(j));

  return (
    <div className="ah-enter mx-auto max-w-5xl space-y-3 px-4 sm:space-y-4 sm:px-6 lg:space-y-5 lg:px-8">
      <KpiTiles />
      <AttentionSummary />

      <div className="flex flex-col gap-3 sm:gap-4 lg:gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-1"><NeedsActionQueue /></div>
          <div className="order-6">
            <QueuePreviewSection
              title="Stale active"
              icon={Clock}
              count={staleItems.length}
              items={staleItems}
              loading={isLoading}
              emptyText="No stale jobs."
              onViewAll={() => navigate("/control/jobs?view=stale")}
            />
          </div>
          <div className="order-7">
            <QueuePreviewSection
              title="Awaiting review"
              icon={FileSearch}
              count={queues?.review?.length}
              items={queues?.review ?? []}
              loading={isLoading}
              emptyText="No PODs pending."
              onViewAll={() => navigate("/control/pod-review")}
            />
          </div>
          <div className="order-5"><RecentActivity /></div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-2"><OperationsCard /></div>
          <div className="order-3"><InvoicingCard /></div>
          <div className="order-4"><ComplianceCard /></div>
          <div className="order-8"><ManagementRoutes /></div>
        </div>
      </div>

      <OperationsBuckets />
    </div>
  );
}

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <AppHeader title="Access Denied" showBack onBack={() => navigate("/")} />
        <p className="text-center py-12 text-sm text-muted-foreground">You do not have permission to access this page.</p>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="ah-root min-h-screen pb-24">
      <AppHeader title="Admin" showBack onBack={() => navigate("/")} />
      <div className="pt-4">
        <AdminDashboardBody />
      </div>
      <BottomNav />
    </div>
  );
};
