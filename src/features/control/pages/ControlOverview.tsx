/**
 * Admin Control Centre — /control (index route)
 * Organisation-level dispatch summary and operational control surface.
 * Reuses Jobs dispatch helpers for semantic alignment.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { QuickActionsBar } from "../components/shared/QuickActionsBar";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import {
  useAdminKpis,
  useDispatchBoard,
  useUnassignedQueue,
  usePodReviewQueue,
  useRecentCompleted,
  type DispatchBoardRow,
} from "../hooks/useAdminControlData";
import { AssignDriverModal } from "../components/AssignDriverModal";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import { AttentionQueue } from "@/features/attention/components/AttentionQueue";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { getStatusStyle } from "@/lib/statusConfig";
import { humanAge, isJobStale, canReviewPod } from "./jobs/jobsUtils";
import {
  Truck, AlertTriangle, ClipboardCheck, CheckCircle, UserX, Send, Clock,
  Eye, UserPlus, FileText, Receipt, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import type { AttentionFiltersState } from "@/features/attention/types/exceptionTypes";

const DEFAULT_FILTERS: AttentionFiltersState = {
  severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "",
};

// ─── Shared mini-column builders for dispatch tables ─────────────────

type RowActions = {
  onView: (r: DispatchBoardRow) => void;
  onAssign: (r: DispatchBoardRow) => void;
  onPod: (r: DispatchBoardRow) => void;
  onExpense: (r: DispatchBoardRow) => void;
};

function refCol(): CompactColumn<DispatchBoardRow> {
  return {
    key: "ref",
    header: "Ref",
    className: "w-[90px]",
    render: (r) => (
      <span className="text-xs font-semibold text-foreground">
        {r.external_job_number || r.id.slice(0, 8)}
      </span>
    ),
  };
}

function vehicleCol(): CompactColumn<DispatchBoardRow> {
  return {
    key: "vehicle",
    header: "Vehicle",
    className: "w-[120px]",
    render: (r) => (
      <div className="flex flex-col gap-0.5">
        <UKPlate reg={r.vehicle_reg} />
        <span className="text-[10px] text-muted-foreground truncate">
          {[r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ")}
        </span>
      </div>
    ),
  };
}

function driverCol(): CompactColumn<DispatchBoardRow> {
  return {
    key: "driver",
    header: "Driver",
    className: "w-[110px]",
    render: (r) =>
      r.resolvedDriverName ? (
        <span className="text-xs text-foreground">{r.resolvedDriverName}</span>
      ) : (
        <span className="inline-flex items-center gap-0.5 text-xs font-medium text-warning">
          <AlertTriangle className="h-3 w-3" />
          Unassigned
        </span>
      ),
  };
}

function routeCol(): CompactColumn<DispatchBoardRow> {
  return {
    key: "route",
    header: "Route",
    render: (r) => (
      <div className="flex flex-col">
        <span className="text-xs text-foreground whitespace-nowrap">
          {r.pickup_postcode} → {r.delivery_postcode}
        </span>
        <span className="text-[10px] text-muted-foreground truncate">
          {[r.pickup_city, r.delivery_city].filter(Boolean).join(" → ")}
        </span>
      </div>
    ),
  };
}

function statusCol(): CompactColumn<DispatchBoardRow> {
  return {
    key: "status",
    header: "Status",
    className: "w-[110px]",
    render: (r) => {
      const s = getStatusStyle(r.status);
      const stale = isJobStale(r);
      return (
        <div className="flex flex-col gap-0.5">
          <span
            style={{ backgroundColor: s.backgroundColor, color: s.color }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase whitespace-nowrap w-fit"
          >
            {s.label}
          </span>
          {stale && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-warning font-medium">
              <Clock className="h-2.5 w-2.5" />
              Stale
            </span>
          )}
        </div>
      );
    },
  };
}

function ageCol(): CompactColumn<DispatchBoardRow> {
  return {
    key: "age",
    header: "Updated",
    className: "w-[60px] text-right",
    render: (r) => (
      <span className="text-[11px] text-muted-foreground tabular-nums">{humanAge(r.updated_at)}</span>
    ),
  };
}

function actionsCol(acts: RowActions): CompactColumn<DispatchBoardRow> {
  return {
    key: "actions",
    header: "",
    className: "w-[140px] text-right",
    render: (r) => (
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
          onClick={(e) => { e.stopPropagation(); acts.onView(r); }}>
          <Eye className="h-3 w-3 mr-0.5" /> View
        </Button>
        {!r.resolvedDriverName && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-warning"
            onClick={(e) => { e.stopPropagation(); acts.onAssign(r); }}>
            <UserPlus className="h-3 w-3 mr-0.5" /> Assign
          </Button>
        )}
        {r.resolvedDriverName && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
            onClick={(e) => { e.stopPropagation(); acts.onAssign(r); }}>
            <UserPlus className="h-3 w-3 mr-0.5" /> Reassign
          </Button>
        )}
        {canReviewPod(r as any) && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-info"
            onClick={(e) => { e.stopPropagation(); acts.onPod(r); }}>
            <ClipboardCheck className="h-3 w-3 mr-0.5" /> POD
          </Button>
        )}
      </div>
    ),
  };
}

// ─── Main component ──────────────────────────────────────────────────

export function ControlOverview() {
  const navigate = useNavigate();
  const { data: kpis, isLoading: kpisLoading } = useAdminKpis();
  const { data: dispatch, isLoading: dispatchLoading } = useDispatchBoard();
  const { data: unassigned, isLoading: unassignedLoading } = useUnassignedQueue();
  const { data: podQueue, isLoading: podLoading } = usePodReviewQueue();
  const { data: completed, isLoading: completedLoading } = useRecentCompleted();
  const [filters] = useState<AttentionFiltersState>(DEFAULT_FILTERS);
  const { data: attentionData, isLoading: attentionLoading, isFetching, refetch } = useAttentionData({ scope: "org", filters });
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ jobId: string; jobRef: string; driverId: string | null } | null>(null);

  const exceptions = attentionData?.exceptions ?? [];
  const highSevCount = exceptions.filter(e => e.severity === "critical" || e.severity === "high").length;

  // Stable action callbacks shared by all dispatch tables
  const rowActions: RowActions = useMemo(() => ({
    onView: (r) => navigate(`/jobs/${r.id}`),
    onAssign: (r) => setAssignTarget({
      jobId: r.id,
      jobRef: r.external_job_number || r.id.slice(0, 8),
      driverId: r.driver_id ?? null,
    }),
    onPod: (r) => navigate(`/jobs/${r.id}/pod`),
    onExpense: (r) => navigate(`/expenses/new?jobId=${r.id}&from=/control`),
  }), [navigate]);

  // ─── Columns ──────────────────────────────────────────────────────
  const dispatchColumns = useMemo<CompactColumn<DispatchBoardRow>[]>(
    () => [refCol(), vehicleCol(), driverCol(), routeCol(), statusCol(), ageCol(), actionsCol(rowActions)],
    [rowActions]
  );

  const unassignedColumns = useMemo<CompactColumn<DispatchBoardRow>[]>(
    () => [refCol(), vehicleCol(), routeCol(), statusCol(), ageCol(), actionsCol(rowActions)],
    [rowActions]
  );

  const podColumns = useMemo<CompactColumn<DispatchBoardRow>[]>(
    () => [refCol(), vehicleCol(), driverCol(), routeCol(), ageCol(), actionsCol(rowActions)],
    [rowActions]
  );

  const completedColumns = useMemo<CompactColumn<DispatchBoardRow>[]>(
    () => [refCol(), vehicleCol(), driverCol(), routeCol(), ageCol()],
    []
  );

  // ─── KPIs ─────────────────────────────────────────────────────────
  const kpiItems = [
    { label: "Ready to Dispatch", value: kpis?.readyToDispatch, icon: Send, variant: "info" as const, loading: kpisLoading },
    { label: "In Transit", value: kpis?.inTransit, icon: Truck, variant: "warning" as const, loading: kpisLoading },
    { label: "Exceptions", value: highSevCount, icon: AlertTriangle, variant: highSevCount > 0 ? "destructive" as const : "default" as const, loading: attentionLoading },
    { label: "POD Review", value: kpis?.podReview, icon: ClipboardCheck, variant: "default" as const, loading: kpisLoading },
    { label: "Completed Today", value: kpis?.completedToday, icon: CheckCircle, variant: "success" as const, loading: kpisLoading },
    { label: "Unassigned", value: kpis?.unassigned, icon: UserX, variant: kpis?.unassigned ? "warning" as const : "default" as const, loading: kpisLoading },
    { label: "Stale (>24h)", value: kpis?.stale, icon: Clock, variant: kpis?.stale ? "warning" as const : "default" as const, loading: kpisLoading },
  ];

  const quickActions = [
    { label: "New Job", icon: FileText, onClick: () => navigate("/jobs/new") },
    { label: "View All Jobs", icon: Eye, onClick: () => navigate("/control/jobs") },
    { label: "Drivers", icon: UserPlus, onClick: () => navigate("/control/drivers") },
    { label: "Expenses", icon: Receipt, onClick: () => navigate("/control/finance") },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Command Center"
        subtitle="Organisation dispatch & operational control"
      />

      {/* A. KPI Strip */}
      <KpiStrip items={kpiItems} className="grid-cols-2 lg:grid-cols-7" />

      {/* B. Quick Actions */}
      <QuickActionsBar actions={quickActions} />

      {/* C. Attention Queue */}
      <ControlSection
        title="Attention Required"
        description={`${exceptions.length} active exception${exceptions.length !== 1 ? "s" : ""}`}
        actions={
          <Button
            variant="ghost" size="sm" className="h-7 text-xs gap-1"
            onClick={() => refetch()} disabled={isFetching}
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      >
        <AttentionQueue
          exceptions={exceptions.slice(0, 10)}
          showOrg={false}
          loading={attentionLoading}
        />
        {exceptions.length > 10 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Showing top 10 of {exceptions.length} exceptions
          </p>
        )}
        {(attentionData?.acknowledgedCount ?? 0) > 0 && (
          <div className="mt-3 border-t pt-3">
            <Button
              variant="ghost" size="sm" className="text-xs text-muted-foreground h-7"
              onClick={() => setShowAcknowledged(!showAcknowledged)}
            >
              {showAcknowledged ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
              {attentionData?.acknowledgedCount} acknowledged
            </Button>
            {showAcknowledged && (
              <div className="opacity-60 mt-2">
                <AttentionQueue
                  exceptions={attentionData?.acknowledgedExceptions ?? []}
                  showOrg={false} loading={false} acknowledged
                />
              </div>
            )}
          </div>
        )}
      </ControlSection>

      {/* D. Unassigned Queue — highest dispatch priority */}
      {(unassigned?.length ?? 0) > 0 && (
        <ControlSection
          title="Needs Assignment"
          description={`${unassigned?.length ?? 0} active jobs with no driver — oldest first`}
          flush
          actions={
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
              onClick={() => navigate("/control/jobs?status=unassigned")}>
              View all <Eye className="h-3 w-3" />
            </Button>
          }
        >
          <CompactTable
            columns={unassignedColumns}
            data={unassigned ?? []}
            loading={unassignedLoading}
            emptyMessage="All active jobs are assigned."
            onRowClick={(row) => navigate(`/jobs/${row.id}`)}
            maxRows={8}
          />
        </ControlSection>
      )}

      {/* E. Active Dispatch Board */}
      <ControlSection
        title="Active Dispatch Board"
        description={`${dispatch?.length ?? 0} jobs in pipeline`}
        flush
        actions={
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
            onClick={() => navigate("/control/jobs?status=active")}>
            View all <Eye className="h-3 w-3" />
          </Button>
        }
      >
        <CompactTable
          columns={dispatchColumns}
          data={dispatch ?? []}
          loading={dispatchLoading}
          emptyMessage="No active jobs in pipeline."
          onRowClick={(row) => navigate(`/jobs/${row.id}`)}
          maxRows={15}
        />
      </ControlSection>

      {/* F. POD Review Queue + Recently Completed */}
      <div className="grid lg:grid-cols-2 gap-4">
        <ControlSection
          title="POD Review Queue"
          description={`${podQueue?.length ?? 0} jobs awaiting closure — oldest first`}
          flush
          actions={
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
              onClick={() => navigate("/control/pod-review")}>
              Review all <ClipboardCheck className="h-3 w-3" />
            </Button>
          }
        >
          <CompactTable
            columns={podColumns}
            data={podQueue ?? []}
            loading={podLoading}
            emptyMessage="No jobs awaiting POD review."
            onRowClick={(row) => navigate(`/jobs/${row.id}/pod`)}
            maxRows={8}
          />
        </ControlSection>

        <ControlSection
          title="Recently Completed"
          description="Latest completed jobs"
          flush
        >
          <CompactTable
            columns={completedColumns}
            data={completed ?? []}
            loading={completedLoading}
            emptyMessage="No recent completions."
            onRowClick={(row) => navigate(`/jobs/${row.id}`)}
            maxRows={8}
          />
        </ControlSection>
      </div>

      {/* Assign Driver Modal */}
      {assignTarget && (
        <AssignDriverModal
          open={!!assignTarget}
          onOpenChange={(open) => { if (!open) setAssignTarget(null); }}
          jobId={assignTarget.jobId}
          jobRef={assignTarget.jobRef}
          currentDriverId={assignTarget.driverId}
        />
      )}
    </ControlShell>
  );
}
