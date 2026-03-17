/**
 * Admin Jobs Queue Page — /admin/jobs
 *
 * Mobile-first queue system grouped by operational priority.
 * Reuses AdminJobCard (which extends the Driver Job Card primitive).
 *
 * Queue groups:
 *   1. Needs Attention — stale or unassigned active jobs
 *   2. In Progress — active jobs with assigned driver
 *   3. Review — POD-pending jobs
 *   4. Completed — recent terminal jobs
 */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { AdminJobCard, type AdminJobRow } from "@/components/AdminJobCard";
import { useAdminJobQueues, useAdminJobQueueKpis } from "@/hooks/useAdminJobQueues";
import { AssignDriverModal } from "@/features/control/components/AssignDriverModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle, Truck, ClipboardCheck, CheckCircle, Search,
  UserX, Clock,
} from "lucide-react";

type QueueFilter = "all" | "attention" | "stale" | "unassigned" | "in_progress" | "review" | "completed";

const FILTERS: { value: QueueFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "all", label: "All", icon: Truck },
  { value: "attention", label: "Attention", icon: AlertTriangle },
  { value: "stale", label: "Stale", icon: Clock },
  { value: "unassigned", label: "Unassigned", icon: UserX },
  { value: "in_progress", label: "Active", icon: Truck },
  { value: "review", label: "Review", icon: ClipboardCheck },
  { value: "completed", label: "Done", icon: CheckCircle },
];

export function AdminJobsQueue() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: queues, isLoading, error } = useAdminJobQueues();
  const { data: kpis } = useAdminJobQueueKpis();
  const initialFilter = (searchParams.get("filter") as QueueFilter) || "all";
  const [filter, setFilter] = useState<QueueFilter>(
    ["all", "attention", "in_progress", "review", "completed", "unassigned"].includes(initialFilter) ? initialFilter : "all"
  );
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<{
    jobId: string; jobRef: string; driverId: string | null;
  } | null>(null);

  const actions = {
    onView: (job: AdminJobRow) => navigate(`/jobs/${job.id}`),
    onAssign: (job: AdminJobRow) => setAssignTarget({
      jobId: job.id,
      jobRef: job.external_job_number || job.id.slice(0, 8),
      driverId: job.driver_id,
    }),
    onPod: (job: AdminJobRow) => navigate(`/jobs/${job.id}/pod`),
  };

  // Search filter
  const filterJobs = (jobs: AdminJobRow[]) => {
    if (!search.trim()) return jobs;
    const s = search.toLowerCase();
    return jobs.filter(
      (j) =>
        j.vehicle_reg?.toLowerCase().includes(s) ||
        j.external_job_number?.toLowerCase().includes(s) ||
        j.resolvedDriverName?.toLowerCase().includes(s) ||
        j.pickup_city?.toLowerCase().includes(s) ||
        j.delivery_city?.toLowerCase().includes(s) ||
        j.pickup_postcode?.toLowerCase().includes(s) ||
        j.delivery_postcode?.toLowerCase().includes(s)
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Admin Jobs" showBack onBack={() => navigate("/admin")} />

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* ── KPI STRIP ── */}
        <div className="grid grid-cols-4 gap-2">
          <KpiPill icon={UserX} label="Unassigned" value={kpis?.unassigned ?? 0} variant={kpis?.unassigned ? "warning" : "default"} />
          <KpiPill icon={Clock} label="Stale" value={kpis?.stale ?? 0} variant={kpis?.stale ? "warning" : "default"} />
          <KpiPill icon={ClipboardCheck} label="Review" value={kpis?.podReview ?? 0} variant="default" />
          <KpiPill icon={Truck} label="Active" value={kpis?.active ?? 0} variant="info" />
        </div>

        {/* ── SEARCH + FILTER ── */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reg, driver, postcode…"
              className="pl-9 min-h-[44px] rounded-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? "default" : "outline"}
                size="sm"
                className="min-h-[36px] text-xs shrink-0 rounded-lg"
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* ── LOADING ── */}
        {isLoading && <DashboardSkeleton />}

        {/* ── ERROR ── */}
        {error && (
          <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20">
            <p className="text-sm text-destructive">
              Failed to load jobs: {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {/* ── QUEUE SECTIONS ── */}
        {queues && !isLoading && (
          <>
            {(filter === "all" || filter === "attention") && (
              <QueueSection
                title="Needs Attention"
                icon={AlertTriangle}
                iconClass="text-warning"
                jobs={filterJobs(queues.needsAttention)}
                emptyText="No jobs need attention."
                actions={actions}
              />
            )}

            {(filter === "all" || filter === "unassigned") && (
              <QueueSection
                title="Unassigned"
                icon={UserX}
                iconClass="text-destructive"
                jobs={filterJobs(queues.unassigned)}
                emptyText="All jobs are assigned."
                actions={actions}
              />
            )}

            {(filter === "all" || filter === "in_progress") && (
              <QueueSection
                title="In Progress"
                icon={Truck}
                iconClass="text-primary"
                jobs={filterJobs(queues.inProgress)}
                emptyText="No active jobs with assigned drivers."
                actions={actions}
              />
            )}

            {(filter === "all" || filter === "review") && (
              <QueueSection
                title="POD Review"
                icon={ClipboardCheck}
                iconClass="text-info"
                jobs={filterJobs(queues.review)}
                emptyText="No jobs pending review."
                actions={actions}
              />
            )}

            {(filter === "all" || filter === "completed") && (
              <QueueSection
                title="Recently Completed"
                icon={CheckCircle}
                iconClass="text-success"
                jobs={filterJobs(queues.completed)}
                emptyText="No recently completed jobs."
                actions={actions}
                collapsible
              />
            )}
          </>
        )}
      </div>

      {/* ── ASSIGN MODAL ── */}
      {assignTarget && (
        <AssignDriverModal
          open={!!assignTarget}
          onOpenChange={(open) => { if (!open) setAssignTarget(null); }}
          jobId={assignTarget.jobId}
          jobRef={assignTarget.jobRef}
          currentDriverId={assignTarget.driverId}
        />
      )}

      <BottomNav />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function KpiPill({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  variant: "default" | "warning" | "info";
}) {
  const colorMap = {
    default: "bg-muted text-muted-foreground",
    warning: "bg-warning/10 text-warning",
    info: "bg-primary/10 text-primary",
  };

  return (
    <div className={`rounded-lg p-2 text-center ${colorMap[variant]}`}>
      <Icon className="h-4 w-4 mx-auto mb-0.5" />
      <p className="text-lg font-semibold leading-tight">{value}</p>
      <p className="text-[9px] font-medium uppercase tracking-wide">{label}</p>
    </div>
  );
}

function QueueSection({
  title,
  icon: Icon,
  iconClass,
  jobs,
  emptyText,
  actions,
  collapsible,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  jobs: AdminJobRow[];
  emptyText: string;
  actions: {
    onView: (job: AdminJobRow) => void;
    onAssign: (job: AdminJobRow) => void;
    onPod: (job: AdminJobRow) => void;
  };
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible ? true : false);
  const count = jobs.length;

  return (
    <section>
      <button
        type="button"
        className="flex items-center gap-2 mb-2 w-full text-left"
        onClick={() => collapsible && setCollapsed(!collapsed)}
      >
        <Icon className={`h-4 w-4 ${iconClass ?? "text-muted-foreground"}`} />
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        <span className="text-[11px] font-medium text-muted-foreground">({count})</span>
        {collapsible && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {collapsed ? "Show" : "Hide"}
          </span>
        )}
      </button>

      {(!collapsible || !collapsed) && (
        <>
          {count === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <AdminJobCard
                  key={job.id}
                  job={job}
                  onView={actions.onView}
                  onAssign={actions.onAssign}
                  onPod={actions.onPod}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
