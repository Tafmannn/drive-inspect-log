/**
 * Super Admin Control Centre — /control/super-admin
 * Platform-wide governance and operational oversight surface.
 * All panels backed by real Supabase data.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { QuickActionsBar } from "../components/shared/QuickActionsBar";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import {
  useSuperAdminKpis,
  useOrganisations,
  useRecentAuditLogs,
  useRecentErrors,
} from "../hooks/useSuperAdminControlData";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import { AttentionQueue } from "@/features/attention/components/AttentionQueue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2, Users, Truck, ScrollText, AlertTriangle,
  UserPlus, FileDown, Eye, RefreshCw, ChevronDown, ChevronUp, Plus,
} from "lucide-react";
import type { AttentionFiltersState } from "@/features/attention/types/exceptionTypes";

const DEFAULT_FILTERS: AttentionFiltersState = {
  severity: "all", category: "all", orgId: "all", dateFrom: "", dateTo: "",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ControlSuperAdmin() {
  const navigate = useNavigate();
  const { data: kpis, isLoading: kpisLoading } = useSuperAdminKpis();
  const { data: orgs, isLoading: orgsLoading } = useOrganisations();
  const { data: auditLogs, isLoading: auditLoading } = useRecentAuditLogs();
  const { data: errorLogs, isLoading: errorsLoading } = useRecentErrors();
  const [filters] = useState<AttentionFiltersState>(DEFAULT_FILTERS);
  const { data: attentionData, isLoading: attentionLoading, isFetching, refetch } = useAttentionData({ scope: "all", filters });
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  const exceptions = attentionData?.exceptions ?? [];
  const highSevCount = exceptions.filter(e => e.severity === "critical" || e.severity === "high").length;

  const kpiItems = [
    { label: "Organisations", value: kpis?.totalOrgs, icon: Building2, variant: "default" as const, loading: kpisLoading },
    { label: "Total Users", value: kpis?.totalUsers, icon: Users, variant: "default" as const, loading: kpisLoading },
    { label: "Active Jobs", value: kpis?.activeJobs, icon: Truck, variant: "info" as const, loading: kpisLoading },
    { label: "Platform Exceptions", value: highSevCount, icon: AlertTriangle, variant: highSevCount > 0 ? "destructive" as const : "default" as const, loading: attentionLoading },
    { label: "Audit Events Today", value: kpis?.auditEventsToday, icon: ScrollText, variant: "default" as const, loading: kpisLoading },
  ];

  const quickActions = [
    { label: "Create Org", icon: Plus, onClick: () => navigate("/super-admin/orgs"), variant: "outline" as const },
    { label: "Manage Users", icon: UserPlus, onClick: () => navigate("/super-admin/users"), variant: "outline" as const },
    { label: "Review Audit", icon: ScrollText, onClick: () => navigate("/super-admin/audit"), variant: "outline" as const },
    { label: "Review Exceptions", icon: AlertTriangle, onClick: () => navigate("/super-admin/attention"), variant: "outline" as const },
    { label: "Export Report", icon: FileDown, onClick: () => {}, variant: "outline" as const, disabled: true },
  ];

  // Org table columns
  const orgColumns: CompactColumn<{ id: string; name: string; created_at: string }>[] = [
    { key: "name", header: "Name", render: (r) => <span className="text-sm font-medium">{r.name}</span> },
    { key: "id", header: "ID", className: "w-[90px]", render: (r) => <span className="text-[11px] font-mono text-muted-foreground">{r.id.slice(0, 8)}</span> },
    { key: "created", header: "Created", className: "w-[90px] text-right", render: (r) => <span className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span> },
  ];

  // Audit table columns
  const auditColumns: CompactColumn<any>[] = [
    {
      key: "time",
      header: "When",
      className: "w-[80px]",
      render: (r) => <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(r.created_at)}</span>,
    },
    {
      key: "actor",
      header: "Admin",
      className: "w-[140px]",
      render: (r) => <span className="text-xs truncate">{r.performed_by_email}</span>,
    },
    {
      key: "action",
      header: "Action",
      render: (r) => (
        <Badge variant="outline" className="text-[10px] font-mono uppercase">
          {r.action}
        </Badge>
      ),
    },
    {
      key: "after",
      header: "After",
      className: "text-right",
      render: (r) => (
        <span className="text-[11px] text-muted-foreground max-w-[200px] truncate block text-right">
          {r.after_state ? JSON.stringify(r.after_state).slice(0, 60) : "—"}
        </span>
      ),
    },
  ];

  // Error log columns
  const errorColumns: CompactColumn<any>[] = [
    {
      key: "time",
      header: "When",
      className: "w-[80px]",
      render: (r) => <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(r.created_at)}</span>,
    },
    {
      key: "sev",
      header: "Level",
      className: "w-[70px]",
      render: (r) => (
        <Badge variant={r.severity === "error" ? "destructive" : "secondary"} className="text-[10px]">
          {r.severity}
        </Badge>
      ),
    },
    {
      key: "event",
      header: "Event",
      className: "w-[160px]",
      render: (r) => <span className="text-xs font-mono">{r.event}</span>,
    },
    {
      key: "msg",
      header: "Message",
      render: (r) => <span className="text-[11px] text-muted-foreground truncate block max-w-[250px]">{r.message ?? "—"}</span>,
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Super Admin"
        subtitle="Platform-wide governance & operational oversight"
      />

      {/* A. KPI Strip */}
      <KpiStrip items={kpiItems} className="grid-cols-3 lg:grid-cols-5" />

      {/* B. Quick Actions */}
      <QuickActionsBar actions={quickActions} />

      {/* C. Global Attention Queue */}
      <ControlSection
        title="Global Incident Queue"
        description={`${exceptions.length} active exception${exceptions.length !== 1 ? "s" : ""} across all organisations`}
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
          showOrg={true}
          loading={attentionLoading}
        />
        {exceptions.length > 10 && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Showing top 10 of {exceptions.length}
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
                  showOrg={true}
                  loading={false}
                  acknowledged
                />
              </div>
            )}
          </div>
        )}
      </ControlSection>

      {/* D. Canonical + Governance Panels */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Tenant Overview */}
        <ControlSection title="Organisations" description="All registered tenants" flush>
          <CompactTable
            columns={orgColumns}
            data={orgs ?? []}
            loading={orgsLoading}
            emptyMessage="No organisations."
          />
        </ControlSection>

        {/* Recent Audit */}
        <ControlSection title="Recent Audit Activity" description="Last 20 administrative actions" flush>
          <CompactTable
            columns={auditColumns}
            data={auditLogs ?? []}
            loading={auditLoading}
            emptyMessage="No audit entries yet."
          />
        </ControlSection>

        {/* Error Feed */}
        <ControlSection title="Error & Warning Feed" description="Recent system errors" flush className="lg:col-span-2">
          <CompactTable
            columns={errorColumns}
            data={errorLogs ?? []}
            loading={errorsLoading}
            emptyMessage="No errors logged."
          />
        </ControlSection>
      </div>
    </ControlShell>
  );
}
