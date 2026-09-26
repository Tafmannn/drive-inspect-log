/**
 * Compliance Control Page — /control/compliance
 * Inspection audits, damage tracking, and operational compliance.
 *
 * Everything on this page is actionable: KPI tiles jump to the section that
 * explains them, every table row opens the job / profile behind it, and each
 * section links to the full list. Links carry ?from= so "back" returns here
 * (with the same period selected).
 */
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  FileWarning,
  ClipboardCheck,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMPLIANCE_PERIODS,
  DEFAULT_COMPLIANCE_PERIOD,
  isCompliancePeriod,
  useComplianceKpis,
  useRecentInspections,
  useDamageReports,
  useJobsMissingInspections,
  type CompliancePeriod,
  type RecentInspectionRow,
  type DamageReportRow,
  type MissingInspectionJobRow,
} from "../hooks/useControlComplianceData";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import { ComplianceDigest } from "@/features/attention/components/ComplianceDigest";
import type { AttentionException } from "@/features/attention/types/exceptionTypes";
import { format } from "date-fns";

const SECTION_IDS = {
  alerts: "compliance-alerts",
  missing: "missing-inspections",
  inspections: "recent-inspections",
  damage: "damage-reports",
} as const;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 60) return `${days}d ago`;
  return format(new Date(iso), "d MMM yy");
}

/** Trailing affordance so rows visibly read as clickable. */
const chevronColumn = <T,>(): CompactColumn<T> => ({
  key: "go",
  header: "",
  className: "w-[28px] text-right",
  render: () => <ChevronRight className="h-4 w-4 text-muted-foreground inline" aria-hidden />,
});

const VehicleCell = ({ reg, jobNumber }: { reg: string; jobNumber: string | null }) => (
  <div className="min-w-0">
    <div className="text-xs font-mono font-medium">{reg}</div>
    {jobNumber && <div className="text-[11px] text-muted-foreground truncate">{jobNumber}</div>}
  </div>
);

const complianceAlertColumns: CompactColumn<AttentionException>[] = [
  {
    key: "severity",
    header: "Sev",
    className: "w-[64px]",
    render: (e) => (
      <Badge
        variant={e.severity === "high" || e.severity === "critical" ? "destructive" : "secondary"}
        className="text-[10px] uppercase"
      >
        {e.severity}
      </Badge>
    ),
  },
  {
    key: "title",
    header: "Issue",
    render: (e) => (
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">{e.title}</div>
        <div className="text-[11px] text-muted-foreground truncate">{e.detail}</div>
      </div>
    ),
  },
  {
    key: "action",
    header: "",
    className: "w-[110px] text-right",
    render: (e) => (
      <span className="text-[11px] font-medium text-primary whitespace-nowrap">
        {e.actionLabel ?? "Open"} <ChevronRight className="h-3.5 w-3.5 inline" aria-hidden />
      </span>
    ),
  },
];

const missingColumns: CompactColumn<MissingInspectionJobRow>[] = [
  {
    key: "vehicle",
    header: "Vehicle",
    render: (r) => <VehicleCell reg={r.vehicle_reg} jobNumber={r.job_number} />,
  },
  {
    key: "missing",
    header: "Missing",
    className: "w-[150px]",
    render: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.missing_pickup && (
          <Badge variant="destructive" className="text-[10px]">Pickup</Badge>
        )}
        {r.missing_delivery && (
          <Badge variant="destructive" className="text-[10px]">Delivery</Badge>
        )}
      </div>
    ),
  },
  {
    key: "when",
    header: "Completed",
    className: "w-[90px] text-right",
    render: (r) => (
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(r.completed_at)}</span>
    ),
  },
  chevronColumn<MissingInspectionJobRow>(),
];

const inspectionColumns: CompactColumn<RecentInspectionRow>[] = [
  {
    key: "reg",
    header: "Vehicle",
    render: (r) => <VehicleCell reg={r.vehicle_reg} jobNumber={r.job_number} />,
  },
  {
    key: "type",
    header: "Type",
    className: "w-[90px]",
    render: (r) => (
      <Badge variant="outline" className="text-[10px] uppercase font-mono">
        {r.type}
      </Badge>
    ),
  },
  {
    key: "damage",
    header: "Damage",
    className: "w-[70px]",
    render: (r) => (
      <Badge variant={r.has_damage ? "destructive" : "secondary"} className="text-[10px]">
        {r.has_damage ? "Yes" : "No"}
      </Badge>
    ),
  },
  {
    key: "when",
    header: "When",
    className: "w-[80px] text-right",
    render: (r) => (
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(r.created_at)}</span>
    ),
  },
  chevronColumn<RecentInspectionRow>(),
];

const damageColumns: CompactColumn<DamageReportRow>[] = [
  {
    key: "vehicle",
    header: "Vehicle",
    render: (r) => <VehicleCell reg={r.vehicle_reg} jobNumber={r.job_number} />,
  },
  {
    key: "damage",
    header: "Damage",
    render: (r) => (
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">
          {[r.area, r.item].filter(Boolean).join(" – ") || "Unspecified area"}
        </div>
        <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
          {r.damage_types?.length ? r.damage_types.join(", ") : "—"}
          {r.inspection_type ? ` · ${r.inspection_type}` : ""}
        </div>
      </div>
    ),
  },
  {
    key: "when",
    header: "Reported",
    className: "w-[80px] text-right",
    render: (r) => (
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(r.created_at)}</span>
    ),
  },
  chevronColumn<DamageReportRow>(),
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ControlCompliance() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const periodParam = searchParams.get("period");
  const period: CompliancePeriod = isCompliancePeriod(periodParam) ? periodParam : DEFAULT_COMPLIANCE_PERIOD;
  const periodMeta = COMPLIANCE_PERIODS.find((p) => p.value === period)!;

  const setPeriod = (next: CompliancePeriod) => {
    const params = new URLSearchParams(searchParams);
    if (next === DEFAULT_COMPLIANCE_PERIOD) params.delete("period");
    else params.set("period", next);
    setSearchParams(params, { replace: true });
  };

  // Every outbound link carries this page (incl. the selected period) so the
  // destination's back button returns here instead of a generic default.
  const from = encodeURIComponent(location.pathname + location.search);
  const openJob = (jobId: string) => navigate(`/jobs/${jobId}?from=${from}`);
  const openPod = (jobId: string) => navigate(`/jobs/${jobId}/pod?from=${from}`);

  const kpisQ = useComplianceKpis(period);
  const inspectionsQ = useRecentInspections();
  const damageQ = useDamageReports();
  const missingQ = useJobsMissingInspections(period);
  const attentionQ = useAttentionData({
    scope: "org",
    filters: {
      severity: "all",
      category: "compliance",
      orgId: "all",
      dateFrom: "",
      dateTo: "",
    },
  });

  const kpis = kpisQ.data;
  const complianceAlerts = attentionQ.data?.exceptions ?? [];
  const expiringDocs = complianceAlerts.filter((e) => e.title.toLowerCase().includes("expir")).length;
  const missingJobs = missingQ.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["control", "compliance"] });
    void queryClient.invalidateQueries({ queryKey: ["attention-center"] });
  };
  const isRefreshing =
    kpisQ.isFetching || inspectionsQ.isFetching || damageQ.isFetching || missingQ.isFetching || attentionQ.isFetching;

  const errorMessage = (label: string) => `Couldn't load ${label}. Tap Refresh to try again.`;

  const kpiItems = [
    {
      label: `Inspections (${periodMeta.short})`,
      value: kpis?.inspectionCount,
      icon: ClipboardCheck,
      variant: "default" as const,
      loading: kpisQ.isLoading,
      onClick: () => scrollToSection(SECTION_IDS.inspections),
      ariaLabel: `Inspections in ${periodMeta.label.toLowerCase()}: ${kpis?.inspectionCount ?? "—"}. Show recent inspections.`,
    },
    {
      label: `Damage reports (${periodMeta.short})`,
      value: kpis?.damageCount,
      icon: FileWarning,
      variant: (kpis?.damageCount ?? 0) > 0 ? ("warning" as const) : ("default" as const),
      loading: kpisQ.isLoading,
      onClick: () => scrollToSection(SECTION_IDS.damage),
      ariaLabel: `Damage reports: ${kpis?.damageCount ?? "—"}. Show damage reports.`,
    },
    {
      label: "Compliance alerts",
      value: complianceAlerts.length,
      icon: AlertTriangle,
      variant: complianceAlerts.length > 0 ? ("warning" as const) : ("success" as const),
      loading: attentionQ.isLoading,
      onClick: () => scrollToSection(SECTION_IDS.alerts),
      ariaLabel: `Compliance alerts: ${complianceAlerts.length}. Show alerts.`,
    },
    {
      label: `Compliance rate (${periodMeta.short})`,
      value: kpis?.complianceRate != null ? `${kpis.complianceRate}%` : "—",
      icon: ShieldCheck,
      variant:
        kpis?.complianceRate != null && kpis.complianceRate >= 80
          ? ("success" as const)
          : kpis?.complianceRate != null
            ? ("warning" as const)
            : ("default" as const),
      loading: kpisQ.isLoading,
      onClick: () => scrollToSection(SECTION_IDS.missing),
      ariaLabel: `Compliance rate: ${kpis?.complianceRate ?? "no completed jobs"}. Show jobs missing inspections.`,
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Compliance"
        subtitle="Inspection audits, damage tracking, and operational compliance"
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={isRefreshing} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {/* Period selector — drives the KPIs and the missing-inspections list */}
      <div role="radiogroup" aria-label="Reporting period" className="flex flex-wrap gap-1.5">
        {COMPLIANCE_PERIODS.map((p) => (
          <Button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={period === p.value}
            size="sm"
            variant={period === p.value ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {kpisQ.isError && (
        <p className="text-xs text-destructive">{errorMessage("the compliance figures")}</p>
      )}

      <KpiStrip items={kpiItems} className="grid-cols-2 lg:grid-cols-4" />

      <ControlSection
        id={SECTION_IDS.alerts}
        title="Compliance Alerts"
        description={
          expiringDocs > 0
            ? `${expiringDocs} document(s) expiring or expired — tap a row to fix it`
            : "Expiring documents and incomplete driver compliance — tap a row to fix it"
        }
        actions={
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/control/drivers")}>
            All drivers <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        }
        flush
      >
        <CompactTable
          columns={complianceAlertColumns}
          data={complianceAlerts.slice(0, 25)}
          loading={attentionQ.isLoading}
          emptyMessage={
            attentionQ.isError
              ? errorMessage("compliance alerts")
              : "No compliance alerts. All documents are current."
          }
          onRowClick={(e) => navigate(e.actionRoute || "/control/drivers")}
        />
      </ControlSection>

      <ComplianceDigest exceptions={complianceAlerts} loading={attentionQ.isLoading} />

      <ControlSection
        id={SECTION_IDS.missing}
        title="Completed jobs missing an inspection"
        description={
          kpis && kpis.completedCount > 0
            ? `${kpis.nonCompliantCount} of ${kpis.completedCount} completed jobs (${periodMeta.label.toLowerCase()}) lack a pickup or delivery inspection — tap to open`
            : `No completed jobs ${period === "all" ? "yet" : `in the ${periodMeta.label.toLowerCase()}`}`
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate("/control/jobs?status=completed")}
          >
            Completed jobs <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        }
        flush
      >
        <CompactTable
          columns={missingColumns}
          data={missingJobs}
          loading={missingQ.isLoading}
          emptyMessage={
            missingQ.isError
              ? errorMessage("jobs")
              : "Every completed job in this period has both inspections."
          }
          onRowClick={(r) => openJob(r.id)}
        />
      </ControlSection>

      <div className="grid lg:grid-cols-2 gap-4">
        <ControlSection
          id={SECTION_IDS.inspections}
          title="Recent Inspections"
          description="Latest pickup and delivery inspections — tap to open the job"
          actions={
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/control/jobs")}>
              All jobs <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          }
          flush
        >
          <CompactTable
            columns={inspectionColumns}
            data={inspectionsQ.data ?? []}
            loading={inspectionsQ.isLoading}
            emptyMessage={inspectionsQ.isError ? errorMessage("inspections") : "No inspections recorded yet."}
            onRowClick={(r) => openJob(r.job_id)}
          />
        </ControlSection>

        <ControlSection
          id={SECTION_IDS.damage}
          title="Damage Reports"
          description="Latest reported damage — tap to view photos on the POD"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => navigate("/control/pod-review")}
            >
              POD review <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          }
          flush
        >
          <CompactTable
            columns={damageColumns}
            data={damageQ.data ?? []}
            loading={damageQ.isLoading}
            emptyMessage={damageQ.isError ? errorMessage("damage reports") : "No damage reported."}
            onRowClick={(r) => r.job_id && openPod(r.job_id)}
          />
        </ControlSection>
      </div>
    </ControlShell>
  );
}
