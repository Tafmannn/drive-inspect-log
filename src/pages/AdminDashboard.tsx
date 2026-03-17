/**
 * Admin Dashboard — Intervention Router
 * Action-first layout: KPI Band → Needs Action → Queue Previews → Quick Routes
 * Every KPI routes to a filtered queue. Every item has a primary action.
 */

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardCard } from "@/components/DashboardCard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useAdminJobQueues, useAdminJobQueueKpis } from "@/hooks/useAdminJobQueues";
import { useAdminMissingEvidence } from "@/hooks/useAdminDashboardData";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import { AdminJobCard } from "@/components/AdminJobCard";
import { AssignDriverModal } from "@/features/control/components/AssignDriverModal";
import type { AdminJobRow } from "@/components/AdminJobCard";
import type { AttentionFiltersState, AttentionException } from "@/features/attention/types/exceptionTypes";
import {
  AlertTriangle, Users, Truck, Receipt, ClipboardCheck,
  ChevronRight, UserX, Clock, FileSearch, ImageOff,
  Eye, UserPlus, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Intervention KPI Band ─────────────────────────────────────── */

interface KpiPillProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "warning" | "destructive";
  loading?: boolean;
  onClick?: () => void;
}

function KpiPill({ label, value, icon: Icon, variant = "default", loading, onClick }: KpiPillProps) {
  const colors = {
    default: "bg-card border-border text-foreground",
    warning: "bg-warning/5 border-warning/30 text-warning",
    destructive: "bg-destructive/5 border-destructive/30 text-destructive",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border p-3 min-w-0 flex-1 transition-colors active:bg-muted/50",
        colors[variant],
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {loading ? (
        <Skeleton className="h-6 w-8" />
      ) : (
        <span className="text-lg font-semibold tabular-nums leading-tight">{value}</span>
      )}
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate w-full text-center flex items-center justify-center gap-0.5">
        {label} <ChevronRight className="h-2.5 w-2.5" />
      </span>
    </button>
  );
}

function InterventionKpis() {
  const navigate = useNavigate();
  const { data: kpis, isLoading } = useAdminJobQueueKpis();
  const { data: missingEvidence, isLoading: evidenceLoading } = useAdminMissingEvidence();

  return (
    <div className="grid grid-cols-4 gap-2">
      <KpiPill
        label="Unassigned"
        value={kpis?.unassigned ?? 0}
        icon={UserX}
        variant={(kpis?.unassigned ?? 0) > 0 ? "destructive" : "default"}
        loading={isLoading}
        onClick={() => navigate("/control/jobs?status=unassigned")}
      />
      <KpiPill
        label="Stale"
        value={kpis?.stale ?? 0}
        icon={Clock}
        variant={(kpis?.stale ?? 0) > 0 ? "warning" : "default"}
        loading={isLoading}
        onClick={() => navigate("/control/jobs?status=stale")}
      />
      <KpiPill
        label="POD Review"
        value={kpis?.podReview ?? 0}
        icon={FileSearch}
        variant={(kpis?.podReview ?? 0) > 0 ? "warning" : "default"}
        loading={isLoading}
        onClick={() => navigate("/control/pod-review")}
      />
      <KpiPill
        label="No Evidence"
        value={missingEvidence ?? 0}
        icon={ImageOff}
        variant={(missingEvidence ?? 0) > 0 ? "destructive" : "default"}
        loading={evidenceLoading}
        onClick={() => navigate("/super-admin/attention")}
      />
    </div>
  );
}

/* ─── Needs Action Preview ─────────────────────────────────────── */

function NeedsActionPreview() {
  const navigate = useNavigate();
  const { data: queues, isLoading: queuesLoading } = useAdminJobQueues();
  const defaultFilters: AttentionFiltersState = { severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "" };
  const { data: attentionData, isLoading: attentionLoading } = useAttentionData({ scope: "org", filters: defaultFilters });
  const [assignTarget, setAssignTarget] = useState<{ jobId: string; jobRef: string; driverId: string | null } | null>(null);

  const loading = queuesLoading || attentionLoading;

  // Build unified "needs action" list: top 5 items from unassigned, stale + high-severity exceptions
  const needsActionItems: { key: string; type: string; label: string; detail: string; age: string; route: string; actionLabel: string; jobId?: string; driverId?: string | null; jobRef?: string }[] = [];

  // Unassigned jobs
  for (const job of (queues?.unassigned ?? []).slice(0, 3)) {
    needsActionItems.push({
      key: `unassigned-${job.id}`,
      type: "Unassigned",
      label: job.vehicle_reg,
      detail: `${job.pickup_postcode} → ${job.delivery_postcode}`,
      age: humanAge(job.updated_at),
      route: `/jobs/${job.id}`,
      actionLabel: "Assign",
      jobId: job.id,
      driverId: job.driver_id,
      jobRef: job.external_job_number || job.id.slice(0, 8),
    });
  }

  // High-severity attention exceptions
  const highExceptions = (attentionData?.exceptions ?? []).filter(e => e.severity === "critical" || e.severity === "high");
  for (const ex of highExceptions.slice(0, 3)) {
    needsActionItems.push({
      key: `exc-${ex.id}`,
      type: ex.category,
      label: ex.title,
      detail: ex.jobNumber ?? "",
      age: humanAge(ex.createdAt),
      route: ex.actionRoute,
      actionLabel: ex.actionLabel,
    });
  }

  // Cap at 5
  const items = needsActionItems.slice(0, 5);

  if (loading) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-destructive" /> Needs Action
        </h3>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-muted-foreground" /> Needs Action
        </h3>
        <div className="text-center py-6">
          <p className="text-sm font-medium text-foreground">✅ All clear</p>
          <p className="text-xs text-muted-foreground mt-0.5">No immediate interventions needed.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Zap className="h-4 w-4 text-destructive" /> Needs Action
        <Badge variant="destructive" className="text-[10px] ml-1">{items.length}</Badge>
      </h3>

      <div className="space-y-1.5">
        {items.map(item => (
          <div
            key={item.key}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 cursor-pointer active:bg-muted/50 transition-colors"
            onClick={() => navigate(item.route)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="outline" className="text-[10px] font-mono uppercase shrink-0">{item.type}</Badge>
                <span className="text-[10px] text-muted-foreground">{item.age}</span>
              </div>
              <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
              {item.detail && <p className="text-xs text-muted-foreground truncate">{item.detail}</p>}
            </div>
            <Button
              size="sm"
              variant={item.type === "Unassigned" ? "default" : "outline"}
              className={cn(
                "min-h-[36px] text-xs shrink-0",
                item.type === "Unassigned" && "bg-warning hover:bg-warning/90 text-warning-foreground"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (item.jobId && item.type === "Unassigned") {
                  setAssignTarget({ jobId: item.jobId, jobRef: item.jobRef ?? "", driverId: item.driverId ?? null });
                } else {
                  navigate(item.route);
                }
              }}
            >
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

function humanAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── Queue Preview ────────────────────────────────────────────── */

function QueuePreview({
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
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          {title}
          {(count ?? items.length) > 0 && (
            <Badge variant="secondary" className="text-[10px]">{count ?? items.length}</Badge>
          )}
        </h3>
        <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs text-muted-foreground h-7 gap-1">
          View all <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>
      ) : (
        items.slice(0, 3).map(job => (
          <AdminJobCard
            key={job.id}
            job={job}
            onView={() => navigate(`/jobs/${job.id}`)}
            onAssign={() => setAssignTarget({ jobId: job.id, jobRef: job.external_job_number || job.id.slice(0, 8), driverId: job.driver_id })}
            onPod={() => navigate(`/jobs/${job.id}/pod`)}
          />
        ))
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

/* ─── Quick Routes ─────────────────────────────────────────────── */

function QuickRoutes() {
  const navigate = useNavigate();

  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground mb-2">Quick Access</h3>
      <div className="grid grid-cols-2 gap-3">
        <DashboardCard
          icon={<Truck className="w-5 h-5 stroke-[2]" />}
          title="Jobs Queue"
          subtitle="Manage all jobs"
          onClick={() => navigate("/control/jobs")}
        />
        <DashboardCard
          icon={<Users className="w-5 h-5 stroke-[2]" />}
          title="Drivers"
          subtitle="Fleet & workload"
          onClick={() => navigate("/control/drivers")}
        />
        <DashboardCard
          icon={<ClipboardCheck className="w-5 h-5 stroke-[2]" />}
          title="POD Review"
          subtitle="Closure workflow"
          onClick={() => navigate("/control/pod-review")}
        />
        <DashboardCard
          icon={<Receipt className="w-5 h-5 stroke-[2]" />}
          title="Finance"
          subtitle="Expenses & invoices"
          onClick={() => navigate("/control/finance")}
        />
      </div>
    </section>
  );
}

/* ─── Main Dashboard ───────────────────────────────────────────── */

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
      <AppHeader title="Admin Dashboard" showBack onBack={() => navigate("/")} />

      <div className="p-4 max-w-lg mx-auto space-y-5">
        {/* 1. Intervention KPI Band */}
        <InterventionKpis />

        <Separator />

        {/* 2. Needs Action (unified top priority items) */}
        <NeedsActionPreview />

        <Separator />

        {/* 3. Queue Previews */}
        <QueuePreview
          title="Unassigned Jobs"
          count={queues?.unassigned?.length}
          items={queues?.unassigned ?? []}
          loading={isLoading}
          emptyText="All jobs are assigned."
          onViewAll={() => navigate("/control/jobs?status=unassigned")}
        />

        <QueuePreview
          title="In Progress"
          count={queues?.inProgress?.length}
          items={queues?.inProgress ?? []}
          loading={isLoading}
          emptyText="No jobs in progress."
          onViewAll={() => navigate("/control/jobs?status=active")}
        />

        <Separator />

        {/* 4. Quick Routes */}
        <QuickRoutes />
      </div>

      <BottomNav />
    </div>
  );
};
