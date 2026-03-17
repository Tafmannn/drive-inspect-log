/**
 * Admin Dashboard — Intervention-First Operational Surface
 *
 * Tier 1: Intervention KPI Strip (4 pills, all tappable)
 * Tier 2: Ranked "Needs Action" unified queue (primary section)
 * Tier 3: Live operational queue previews (secondary)
 * Tier 4: Management route links (bottom)
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UKPlate } from "@/components/UKPlate";
import { useAuth } from "@/context/AuthContext";
import { useAdminJobQueues, useAdminJobQueueKpis } from "@/hooks/useAdminJobQueues";
import { useAdminMissingEvidence, useAdminComplianceCounts } from "@/hooks/useAdminDashboardData";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import { AssignDriverModal } from "@/features/control/components/AssignDriverModal";
import { getStatusStyle } from "@/lib/statusConfig";
import { humanAge, isJobStale, isUnassigned } from "@/features/control/pages/jobs/jobsUtils";
import type { AdminJobRow } from "@/components/AdminJobCard";
import type { AttentionFiltersState } from "@/features/attention/types/exceptionTypes";
import { cn } from "@/lib/utils";
import {
  UserX, Clock, FileSearch, ImageOff, ChevronRight,
  Zap, Eye, UserPlus, MapPin, AlertTriangle, User,
  Truck, Users, ClipboardCheck, Receipt,
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
  vehicleReg?: string;
  route?: string; // compressed route
  age: string;
  driverId?: string | null;
  resolvedDriverName?: string | null;
  status?: string;
  actionLabel: string;
  actionRoute: string;
}

// ── Tier 1: Intervention KPI Strip ───────────────────────────────────

function KpiPill({
  label, value, icon: Icon, variant = "default", loading, onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "warning" | "destructive";
  loading?: boolean;
  onClick: () => void;
}) {
  const styles = {
    default: "bg-card border-border text-muted-foreground",
    warning: "bg-warning/5 border-warning/30 text-warning",
    destructive: "bg-destructive/5 border-destructive/30 text-destructive",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg border p-2.5 min-w-0 flex-1 transition-colors active:bg-muted/50",
        styles[variant],
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {loading ? (
        <Skeleton className="h-5 w-7" />
      ) : (
        <span className="text-base font-bold tabular-nums leading-tight">{value}</span>
      )}
      <span className="text-[9px] font-semibold uppercase tracking-wider truncate w-full text-center flex items-center justify-center gap-0.5">
        {label} <ChevronRight className="h-2 w-2" />
      </span>
    </button>
  );
}

function InterventionKpis() {
  const navigate = useNavigate();
  const { data: kpis, isLoading } = useAdminJobQueueKpis();
  const { data: missingEvidence, isLoading: evidenceLoading } = useAdminMissingEvidence();

  return (
    <div className="grid grid-cols-4 gap-1.5">
      <KpiPill
        label="Unassigned"
        value={kpis?.unassigned ?? 0}
        icon={UserX}
        variant={(kpis?.unassigned ?? 0) > 0 ? "destructive" : "default"}
        loading={isLoading}
        onClick={() => navigate("/admin/jobs?filter=unassigned")}
      />
      <KpiPill
        label="Stale"
        value={kpis?.stale ?? 0}
        icon={Clock}
        variant={(kpis?.stale ?? 0) > 0 ? "warning" : "default"}
        loading={isLoading}
        onClick={() => navigate("/admin/jobs?filter=stale")}
      />
      <KpiPill
        label="POD Review"
        value={kpis?.podReview ?? 0}
        icon={FileSearch}
        variant={(kpis?.podReview ?? 0) > 0 ? "warning" : "default"}
        loading={isLoading}
        onClick={() => navigate("/admin/jobs?filter=review")}
      />
      <KpiPill
        label="Evidence"
        value={missingEvidence ?? 0}
        icon={ImageOff}
        variant={(missingEvidence ?? 0) > 0 ? "destructive" : "default"}
        loading={evidenceLoading}
        onClick={() => navigate("/admin/jobs?filter=evidence")}
      />
    </div>
  );
}

// ── Tier 2: Ranked Needs Action Queue ────────────────────────────────

function NeedsActionQueue() {
  const navigate = useNavigate();
  const { data: queues, isLoading: queuesLoading } = useAdminJobQueues();
  const defaultFilters: AttentionFiltersState = { severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "" };
  const { data: attentionData, isLoading: attentionLoading } = useAttentionData({ scope: "org", filters: defaultFilters });
  const [assignTarget, setAssignTarget] = useState<{ jobId: string; jobRef: string; driverId: string | null } | null>(null);

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
        queueLabel: "POD Review",
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

  if (loading) {
    return (
      <section className="space-y-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" /> Needs Action
        </h3>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="space-y-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" /> Needs Action
        </h3>
        <div className="text-center py-6 rounded-lg border border-dashed border-border">
          <p className="text-sm font-medium text-foreground">✅ All clear</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">No interventions required.</p>
        </div>
      </section>
    );
  }

  const queueColors: Record<string, string> = {
    unassigned: "bg-destructive/10 text-destructive border-destructive/20",
    stale: "bg-warning/10 text-warning border-warning/20",
    evidence: "bg-destructive/10 text-destructive border-destructive/20",
    pod_review: "bg-primary/10 text-primary border-primary/20",
  };

  const queueActionVariants: Record<string, "default" | "outline" | "destructive"> = {
    unassigned: "default",
    stale: "outline",
    evidence: "outline",
    pod_review: "outline",
  };

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5" /> Needs Action
          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">{items.length}</Badge>
        </h3>
      </div>

      <div className="space-y-1">
        {items.map(item => (
          <div
            key={item.key}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 cursor-pointer active:bg-muted/50 transition-colors"
            onClick={() => navigate(item.actionRoute)}
          >
            {/* Left: queue chip + info */}
            <div className="flex-1 min-w-0 space-y-0.5">
              {/* Band 1: chip + ref + age */}
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none shrink-0 border",
                  queueColors[item.queueType],
                )}>
                  {item.queueLabel}
                </span>
                {item.jobRef && (
                  <span className="text-[10px] font-mono text-muted-foreground truncate">{item.jobRef}</span>
                )}
                <span className="text-[9px] text-muted-foreground shrink-0 ml-auto mr-1">{item.age}</span>
              </div>

              {/* Band 2: reg + route or title */}
              <div className="flex items-center gap-1.5 min-w-0">
                {item.vehicleReg && <UKPlate reg={item.vehicleReg} />}
                {item.route && (
                  <span className="text-[11px] text-muted-foreground truncate flex items-center gap-0.5">
                    <MapPin className="h-2.5 w-2.5 shrink-0" /> {item.route}
                  </span>
                )}
                {!item.vehicleReg && !item.route && (
                  <span className="text-[11px] text-foreground truncate">{item.jobRef}</span>
                )}
              </div>

              {/* Band 2b: driver state (for job items) */}
              {item.jobId && (
                <div className="flex items-center gap-1">
                  {item.resolvedDriverName ? (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <User className="h-2.5 w-2.5" /> {item.resolvedDriverName}
                    </span>
                  ) : (
                    <span className="text-[10px] text-warning font-medium flex items-center gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" /> Unassigned
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Right: dominant action */}
            <Button
              size="sm"
              variant={queueActionVariants[item.queueType]}
              className={cn(
                "min-h-[34px] text-[11px] shrink-0 px-3",
                item.queueType === "unassigned" && "bg-warning hover:bg-warning/90 text-warning-foreground",
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
              {item.queueType === "unassigned" && <UserPlus className="h-3 w-3 mr-1" />}
              {item.queueType === "pod_review" && <ClipboardCheck className="h-3 w-3 mr-1" />}
              {item.actionLabel}
            </Button>
          </div>
        ))}
      </div>

      {assignTarget && (
        <AssignDriverModal
          open={!!assignTarget}
          onOpenChange={(open) => { if (!open) setAssignTarget(null); }}
          jobId={assignTarget.jobId}
          jobRef={assignTarget.jobRef}
          currentDriverId={assignTarget.driverId}
        />
      )}
    </section>
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
    <div
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 cursor-pointer active:bg-muted/50 transition-colors"
      onClick={onView}
    >
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span
            style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none shrink-0"
          >
            {statusStyle.label}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground truncate">
            {job.external_job_number || job.id.slice(0, 8)}
          </span>
          {stale && (
            <span className="text-[9px] text-warning font-medium flex items-center gap-0.5 shrink-0">
              <Clock className="h-2.5 w-2.5" /> Stale
            </span>
          )}
          <span className="text-[9px] text-muted-foreground shrink-0 ml-auto">{humanAge(job.updated_at)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <UKPlate reg={job.vehicle_reg} />
          <span className="text-[11px] text-muted-foreground truncate">
            {job.pickup_postcode} → {job.delivery_postcode}
          </span>
        </div>
        {unassigned ? (
          <span className="text-[10px] text-warning font-medium flex items-center gap-0.5">
            <AlertTriangle className="h-2.5 w-2.5" /> Unassigned
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <User className="h-2.5 w-2.5" /> {job.resolvedDriverName}
          </span>
        )}
      </div>

      {/* One dominant action */}
      {unassigned ? (
        <Button
          size="sm"
          className="min-h-[34px] text-[11px] shrink-0 px-3 bg-warning hover:bg-warning/90 text-warning-foreground"
          onClick={(e) => { e.stopPropagation(); onAssign(); }}
        >
          <UserPlus className="h-3 w-3 mr-1" /> Assign
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="min-h-[34px] text-[11px] shrink-0 px-3"
          onClick={(e) => { e.stopPropagation(); onView(); }}
        >
          <Eye className="h-3 w-3 mr-1" /> View
        </Button>
      )}
    </div>
  );
}

function QueuePreviewSection({
  title,
  count,
  items,
  loading,
  emptyText,
  onViewAll,
}: {
  title: string;
  count?: number;
  items: AdminJobRow[];
  loading: boolean;
  emptyText: string;
  onViewAll: () => void;
}) {
  const navigate = useNavigate();
  const [assignTarget, setAssignTarget] = useState<{ jobId: string; jobRef: string; driverId: string | null } | null>(null);

  if (loading) {
    return (
      <section className="space-y-1.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
        {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </section>
    );
  }

  const displayCount = count ?? items.length;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
          {title}
          {displayCount > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{displayCount}</Badge>
          )}
        </h3>
        <button onClick={onViewAll} className="text-[11px] text-muted-foreground flex items-center gap-0.5 active:text-foreground">
          View all <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground py-3 text-center">{emptyText}</p>
      ) : (
        <div className="space-y-1">
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
        </div>
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
    </section>
  );
}

// ── Tier 4: Management Routes ────────────────────────────────────────

function ManagementRoutes() {
  const navigate = useNavigate();

  const routes = [
    { label: "Full Jobs Queue", icon: Truck, path: "/admin/jobs" },
    { label: "Fleet & Drivers", icon: Users, path: "/control/drivers" },
    { label: "Driver Onboarding", icon: ClipboardCheck, path: "/admin/onboarding" },
    { label: "POD Closure", icon: ClipboardCheck, path: "/control/pod-review" },
    { label: "Expenses & Finance", icon: Receipt, path: "/control/finance" },
  ];

  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Management</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {routes.map(r => (
          <button
            key={r.path}
            onClick={() => navigate(r.path)}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left active:bg-muted/50 transition-colors"
          >
            <r.icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-[12px] font-medium text-foreground">{r.label}</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto" />
          </button>
        ))}
      </div>
    </section>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: queues, isLoading } = useAdminJobQueues();

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
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Admin" showBack onBack={() => navigate("/")} />

      <div className="p-3 max-w-lg mx-auto space-y-4">
        {/* Tier 1 — Intervention KPIs */}
        <InterventionKpis />

        {/* Tier 2 — Ranked Needs Action (primary section) */}
        <NeedsActionQueue />

        {/* Tier 3 — Queue Snapshots (broader view, not top interventions) */}
        <div className="space-y-3">
          <QueuePreviewSection
            title="Stale Active"
            count={(queues?.needsAttention ?? []).filter(j => isJobStale(j)).length}
            items={(queues?.needsAttention ?? []).filter(j => isJobStale(j))}
            loading={isLoading}
            emptyText="No stale jobs."
            onViewAll={() => navigate("/admin/jobs?filter=stale")}
          />
          <QueuePreviewSection
            title="Awaiting Review"
            count={queues?.review?.length}
            items={queues?.review ?? []}
            loading={isLoading}
            emptyText="No PODs pending."
            onViewAll={() => navigate("/admin/jobs?filter=review")}
          />
        </div>

        {/* Tier 4 — Management Routes */}
        <ManagementRoutes />
      </div>

      <BottomNav />
    </div>
  );
};
