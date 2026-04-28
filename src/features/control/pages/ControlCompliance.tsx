/**
 * Compliance Control Page — /control/compliance
 * Inspection audits, damage tracking, and operational compliance.
 */
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, FileWarning, ClipboardCheck, AlertTriangle } from "lucide-react";
import {
  useComplianceKpis,
  useRecentInspections,
  useOutstandingDamage,
  type RecentInspectionRow,
  type OutstandingDamageRow,
} from "../hooks/useControlComplianceData";
import { useAttentionData } from "@/features/attention/hooks/useAttentionData";
import { ComplianceDigest } from "@/features/attention/components/ComplianceDigest";
import type { AttentionException } from "@/features/attention/types/exceptionTypes";
import { format } from "date-fns";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const inspectionColumns: CompactColumn<RecentInspectionRow>[] = [
  {
    key: "reg",
    header: "Vehicle",
    render: (r) => (
      <span className="text-xs font-mono font-medium">{r.vehicle_reg}</span>
    ),
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
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
        {timeAgo(r.created_at)}
      </span>
    ),
  },
];

const damageColumns: CompactColumn<OutstandingDamageRow>[] = [
  {
    key: "area",
    header: "Area",
    render: (r) => (
      <span className="text-xs font-medium">{r.area ?? "Unknown"}</span>
    ),
  },
  {
    key: "types",
    header: "Types",
    render: (r) => (
      <span className="text-[11px] text-muted-foreground truncate block max-w-[180px]">
        {r.damage_types?.join(", ") ?? "—"}
      </span>
    ),
  },
  {
    key: "when",
    header: "Reported",
    className: "w-[80px] text-right",
    render: (r) => (
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
        {timeAgo(r.created_at)}
      </span>
    ),
  },
];

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
];

export function ControlCompliance() {
  const navigate = useNavigate();
  const { data: kpis, isLoading: kpisLoading } = useComplianceKpis();
  const { data: inspections, isLoading: inspLoading } = useRecentInspections();
  const { data: damage, isLoading: dmgLoading } = useOutstandingDamage();
  const { data: attention, isLoading: attentionLoading } = useAttentionData({
    scope: "org",
    filters: {
      severity: "all",
      category: "compliance",
      orgId: "all",
      dateFrom: "",
      dateTo: "",
    },
  });

  const complianceAlerts = attention?.exceptions ?? [];
  const expiringDocs = complianceAlerts.filter((e) => e.title.toLowerCase().includes("expir")).length;

  const kpiItems = [
    {
      label: "Inspections (30d)",
      value: kpis?.inspectionCount,
      icon: ClipboardCheck,
      variant: "default" as const,
      loading: kpisLoading,
    },
    {
      label: "Damage Reports",
      value: kpis?.damageCount,
      icon: FileWarning,
      variant: (kpis?.damageCount ?? 0) > 0 ? ("warning" as const) : ("default" as const),
      loading: kpisLoading,
    },
    {
      label: "Compliance Alerts",
      value: complianceAlerts.length,
      icon: AlertTriangle,
      variant: complianceAlerts.length > 0 ? ("warning" as const) : ("success" as const),
      loading: attentionLoading,
    },
    {
      label: "Compliance Rate",
      value: kpis?.complianceRate != null ? `${kpis.complianceRate}%` : undefined,
      icon: ShieldCheck,
      variant:
        kpis?.complianceRate != null && kpis.complianceRate >= 80
          ? ("success" as const)
          : kpis?.complianceRate != null
            ? ("warning" as const)
            : ("default" as const),
      loading: kpisLoading,
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Compliance"
        subtitle="Inspection audits, damage tracking, and operational compliance"
      />

      <KpiStrip items={kpiItems} className="grid-cols-2 lg:grid-cols-4" />

      <ControlSection
        title="Compliance Alerts"
        description={
          expiringDocs > 0
            ? `${expiringDocs} document(s) expiring or expired — tap a row to open the profile`
            : "Expiring documents and incomplete driver compliance"
        }
        flush
      >
        <CompactTable
          columns={complianceAlertColumns}
          data={complianceAlerts.slice(0, 25)}
          loading={attentionLoading}
          emptyMessage="No compliance alerts. All documents are current."
          onRowClick={(e) => e.actionRoute && navigate(e.actionRoute)}
        />
      </ControlSection>

      <div className="grid lg:grid-cols-2 gap-4">
        <ControlSection
          title="Recent Inspections"
          description="Latest pickup and delivery inspections"
          flush
        >
          <CompactTable
            columns={inspectionColumns}
            data={inspections ?? []}
            loading={inspLoading}
            emptyMessage="No inspections recorded yet."
          />
        </ControlSection>

        <ControlSection
          title="Outstanding Issues"
          description="Unresolved damage reports and flags"
          flush
        >
          <CompactTable
            columns={damageColumns}
            data={damage ?? []}
            loading={dmgLoading}
            emptyMessage="No outstanding damage reports."
          />
        </ControlSection>
      </div>
    </ControlShell>
  );
}
