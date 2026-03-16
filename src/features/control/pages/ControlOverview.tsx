/**
 * Admin Control Centre — /control (index route)
 * Organisation-level dispatch and operational control surface.
 * All data is backed by real Supabase queries.
 */
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { QuickActionsBar } from "../components/shared/QuickActionsBar";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { SeverityChip } from "../components/shared/SeverityChip";
import { StatusChip } from "../components/shared/StatusChip";
import { useAdminKpis, useDispatchBoard, useRecentCompleted } from "../hooks/useAdminControlData";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import { AttentionQueue } from "@/features/attention/components/AttentionQueue";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { getStatusStyle } from "@/lib/statusConfig";
import {
  Truck, AlertTriangle, ClipboardCheck, CheckCircle, UserX, Send,
  Eye, UserPlus, FileText, Receipt, Phone, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { useState } from "react";
import type { AttentionFiltersState } from "@/features/attention/types/exceptionTypes";

const DEFAULT_FILTERS: AttentionFiltersState = {
  severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "",
};

function humanAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function ControlOverview() {
  const navigate = useNavigate();
  const { data: kpis, isLoading: kpisLoading } = useAdminKpis();
  const { data: dispatch, isLoading: dispatchLoading } = useDispatchBoard();
  const { data: completed, isLoading: completedLoading } = useRecentCompleted();
  const [filters] = useState<AttentionFiltersState>(DEFAULT_FILTERS);
  const { data: attentionData, isLoading: attentionLoading, isFetching, refetch } = useAttentionData({ scope: "org", filters });
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const exceptions = attentionData?.exceptions ?? [];
  const highSevCount = exceptions.filter(e => e.severity === "critical" || e.severity === "high").length;

  const kpiItems = [
    { label: "Ready to Dispatch", value: kpis?.readyToDispatch, icon: Send, variant: "info" as const, loading: kpisLoading },
    { label: "In Transit", value: kpis?.inTransit, icon: Truck, variant: "warning" as const, loading: kpisLoading },
    { label: "Exceptions", value: highSevCount, icon: AlertTriangle, variant: highSevCount > 0 ? "destructive" as const : "default" as const, loading: attentionLoading },
    { label: "POD Review", value: kpis?.podReview, icon: ClipboardCheck, variant: "default" as const, loading: kpisLoading },
    { label: "Completed Today", value: kpis?.completedToday, icon: CheckCircle, variant: "success" as const, loading: kpisLoading },
    { label: "Unassigned", value: kpis?.unassigned, icon: UserX, variant: kpis?.unassigned ? "warning" as const : "default" as const, loading: kpisLoading },
  ];

  const quickActions = [
    { label: "New Job", icon: FileText, onClick: () => navigate("/jobs/new") },
    { label: "View All Jobs", icon: Eye, onClick: () => navigate("/control/jobs") },
    { label: "Drivers", icon: UserPlus, onClick: () => navigate("/control/drivers") },
    { label: "Expenses", icon: Receipt, onClick: () => navigate("/control/finance") },
  ];

  type DispatchRow = NonNullable<typeof dispatch>[number];

  const dispatchColumns: CompactColumn<DispatchRow>[] = [
    {
      key: "ref",
      header: "Ref",
      className: "w-[90px]",
      render: (r) => <span className="text-xs font-medium">{r.external_job_number || r.id.slice(0, 8)}</span>,
    },
    {
      key: "reg",
      header: "Vehicle",
      className: "w-[110px]",
      render: (r) => <UKPlate reg={r.vehicle_reg} />,
    },
    {
      key: "driver",
      header: "Driver",
      className: "w-[120px]",
      render: (r) => r.driver_name
        ? <span className="text-xs">{r.driver_name}</span>
        : <span className="text-xs font-medium text-warning">Unassigned</span>,
    },
    {
      key: "route",
      header: "Route",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.pickup_postcode} → {r.delivery_postcode}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-[100px]",
      render: (r) => {
        const s = getStatusStyle(r.status);
        return (
          <span
            style={{ backgroundColor: s.backgroundColor, color: s.color }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase whitespace-nowrap"
          >
            {s.label}
          </span>
        );
      },
    },
    {
      key: "age",
      header: "Updated",
      className: "w-[70px] text-right",
      render: (r) => <span className="text-[11px] text-muted-foreground">{humanAge(r.updated_at)}</span>,
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Command Center"
        subtitle="Organisation dispatch & operational control"
      />

      {/* A. KPI Strip */}
      <KpiStrip items={kpiItems} className="grid-cols-3 lg:grid-cols-6" />

      {/* B. Quick Actions */}
      <QuickActionsBar actions={quickActions} />

      {/* C. Attention Queue — top exceptions inline */}
      <ControlSection
        title="Attention Required"
        description={`${exceptions.length} active exception${exceptions.length !== 1 ? "s" : ""}`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => refetch()}
            disabled={isFetching}
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
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-7"
              onClick={() => setShowAcknowledged(!showAcknowledged)}
            >
              {showAcknowledged ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
              {attentionData?.acknowledgedCount} acknowledged
            </Button>
            {showAcknowledged && (
              <div className="opacity-60 mt-2">
                <AttentionQueue
                  exceptions={attentionData?.acknowledgedExceptions ?? []}
                  showOrg={false}
                  loading={false}
                  acknowledged
                />
              </div>
            )}
          </div>
        )}
      </ControlSection>

      {/* D. Dispatch Board + Recent Completed */}
      <div className="grid lg:grid-cols-3 gap-4">
        <ControlSection
          title="Active Dispatch Board"
          description="Live jobs in pipeline"
          className="lg:col-span-2"
          flush
        >
          <CompactTable
            columns={dispatchColumns}
            data={dispatch ?? []}
            loading={dispatchLoading}
            emptyMessage="No active jobs."
            onRowClick={(row) => navigate(`/jobs/${row.id}`)}
          />
        </ControlSection>

        <ControlSection
          title="Recently Completed"
          description="Last 20 completed jobs"
          flush
        >
          <CompactTable
            columns={[
              {
                key: "ref",
                header: "Ref",
                render: (r: any) => <span className="text-xs font-medium">{r.external_job_number || r.id.slice(0, 8)}</span>,
              },
              {
                key: "reg",
                header: "Reg",
                render: (r: any) => <UKPlate reg={r.vehicle_reg} />,
              },
              {
                key: "when",
                header: "Completed",
                className: "text-right",
                render: (r: any) => <span className="text-[11px] text-muted-foreground">{r.completed_at ? humanAge(r.completed_at) : "—"}</span>,
              },
            ]}
            data={completed ?? []}
            loading={completedLoading}
            emptyMessage="No recent completions."
            onRowClick={(row: any) => navigate(`/jobs/${row.id}`)}
            maxRows={10}
          />
        </ControlSection>
      </div>
    </ControlShell>
  );
}
