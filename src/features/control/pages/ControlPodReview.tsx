/**
 * POD Review Control Page — /control/pod-review
 * Focused closure workspace: review late-stage jobs, identify evidence gaps, resolve POD friction.
 *
 * ACTION MAPPINGS:
 *   - "View Job"          → /jobs/:id               (canonical job detail)
 *   - "Review POD"        → /jobs/:id/pod           (POD report page)
 *   - "Review Inspection" → /jobs/:id               (job detail shows inspection state)
 *   - "Add Expense"       → /expenses/new           (expense form)
 *
 * NOTE: "Review POD" maps to the existing /jobs/:id/pod route which renders PodReport.
 * If a job has no POD yet, that page handles the empty state gracefully.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { StatusChip } from "../components/shared/StatusChip";
import { FilterBar } from "../components/shared/FilterBar";
import {
  useClosureReviewQueue,
  useClosureKpis,
  type ClosureReviewRow,
} from "../hooks/useClosureReview";
import { UKPlate } from "@/components/UKPlate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getStatusStyle } from "@/lib/statusConfig";
import {
  Search, ClipboardCheck, FileCheck, Truck, AlertTriangle,
  Eye, FileText, ClipboardList, Receipt, Clock,
} from "lucide-react";

type StatusFilterValue = "all" | "pod_ready" | "delivery_complete" | "recently_completed";

const STATUS_OPTIONS: { label: string; value: StatusFilterValue }[] = [
  { label: "Review Queue", value: "all" },
  { label: "POD Ready", value: "pod_ready" },
  { label: "Delivery Complete", value: "delivery_complete" },
  { label: "Recently Completed", value: "recently_completed" },
];

function humanAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function ControlPodReview() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");

  const { data, isLoading } = useClosureReviewQueue();
  const { data: kpis, isLoading: kpisLoading } = useClosureKpis();

  // Merge + filter
  const rows = useMemo(() => {
    if (!data) return [];

    let merged: ClosureReviewRow[];
    if (statusFilter === "recently_completed") {
      merged = data.recentlyCompleted;
    } else if (statusFilter === "pod_ready") {
      merged = data.queue.filter(r => r.status === "pod_ready");
    } else if (statusFilter === "delivery_complete") {
      merged = data.queue.filter(r => r.status === "delivery_complete");
    } else {
      // "all" = active queue first, then recently completed
      merged = [...data.queue, ...data.recentlyCompleted];
    }

    if (search.trim()) {
      const s = search.toLowerCase();
      merged = merged.filter(
        r =>
          r.vehicle_reg?.toLowerCase().includes(s) ||
          r.external_job_number?.toLowerCase().includes(s) ||
          r.client_company?.toLowerCase().includes(s) ||
          r.client_name?.toLowerCase().includes(s) ||
          r.resolvedDriverName?.toLowerCase().includes(s) ||
          r.delivery_postcode?.toLowerCase().includes(s) ||
          r.delivery_city?.toLowerCase().includes(s)
      );
    }

    return merged;
  }, [data, statusFilter, search]);

  // ── KPI Strip ──
  const kpiItems = [
    { label: "Review Queue", value: kpis?.reviewQueue, icon: ClipboardCheck, variant: "warning" as const, loading: kpisLoading },
    { label: "POD Ready", value: kpis?.podReady, icon: FileCheck, variant: "info" as const, loading: kpisLoading },
    { label: "Delivery Complete", value: kpis?.deliveryComplete, icon: Truck, variant: "default" as const, loading: kpisLoading },
    { label: "Completed (7d)", value: kpis?.completedRecent, icon: ClipboardList, variant: "success" as const, loading: kpisLoading },
    {
      label: "No Delivery Insp.",
      value: kpis?.missingDeliveryInspection,
      icon: AlertTriangle,
      variant: kpis?.missingDeliveryInspection ? "destructive" as const : "default" as const,
      loading: kpisLoading,
    },
  ];

  // ── Table columns ──
  const columns: CompactColumn<ClosureReviewRow>[] = [
    {
      key: "ref",
      header: "Ref",
      className: "w-[100px]",
      render: (r) => (
        <span className="text-xs font-semibold text-foreground">
          {r.external_job_number || r.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: "vehicle",
      header: "Vehicle",
      className: "w-[130px]",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <UKPlate reg={r.vehicle_reg} />
          <span className="text-[10px] text-muted-foreground truncate">
            {r.vehicle_make} {r.vehicle_model}
          </span>
        </div>
      ),
    },
    {
      key: "driver",
      header: "Driver",
      className: "w-[110px]",
      render: (r) =>
        r.resolvedDriverName ? (
          <span className="text-xs text-foreground">{r.resolvedDriverName}</span>
        ) : (
          <span className="text-xs font-medium text-warning">Unassigned</span>
        ),
    },
    {
      key: "delivery",
      header: "Delivery",
      render: (r) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {r.delivery_city ?? r.delivery_postcode}
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
      key: "evidence",
      header: "Evidence",
      className: "w-[120px]",
      render: (r) => {
        // Derived signals — visually secondary
        const cues: React.ReactNode[] = [];
        if (r.missingDeliveryInspection) {
          cues.push(
            <StatusChip key="del" label="No delivery insp." variant="destructive" className="text-[9px] py-0" />
          );
        }
        if (r.missingPickupInspection) {
          cues.push(
            <StatusChip key="pick" label="No pickup insp." variant="warning" className="text-[9px] py-0" />
          );
        }
        if (r.isStale) {
          cues.push(
            <Badge key="stale" variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 text-muted-foreground border-border">
              <Clock className="h-2.5 w-2.5" /> Stale
            </Badge>
          );
        }
        if (cues.length === 0) {
          return <span className="text-[10px] text-muted-foreground">—</span>;
        }
        return <div className="flex flex-wrap gap-1">{cues}</div>;
      },
    },
    {
      key: "age",
      header: "Age",
      className: "w-[55px] text-right",
      render: (r) => (
        <span className="text-[11px] text-muted-foreground">
          {humanAge(r.completed_at ?? r.updated_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[180px] text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${r.id}/pod?from=/control/pod-review`); }}
          >
            <FileText className="h-3 w-3 mr-0.5" /> POD
          </Button>
          {!r.has_delivery_inspection && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-warning"
              onClick={(e) => { e.stopPropagation(); navigate(`/inspection/${r.id}/delivery`); }}
            >
              <ClipboardList className="h-3 w-3 mr-0.5" /> Inspect
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${r.id}?from=pod-review`); }}
          >
            <Eye className="h-3 w-3 mr-0.5" /> View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={(e) => { e.stopPropagation(); navigate(`/expenses/new?jobId=${r.id}&from=pod-review`); }}
          >
            <Receipt className="h-3 w-3 mr-0.5" /> Expense
          </Button>
        </div>
      ),
    },
  ];

  const queueCount = data ? data.queue.length : 0;
  const recentCount = data ? data.recentlyCompleted.length : 0;

  return (
    <ControlShell>
      <ControlHeader
        title="POD Review"
        subtitle="Closure workflow — review late-stage jobs, verify evidence, and resolve outstanding items"
      />

      <KpiStrip items={kpiItems} className="grid-cols-2 lg:grid-cols-5" />

      <FilterBar>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search reg, driver, client, postcode…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {STATUS_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={statusFilter === opt.value ? "default" : "outline"}
            size="sm"
            className="text-xs h-8"
            onClick={() => setStatusFilter(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </FilterBar>

      {/* Active Review Queue */}
      <ControlSection
        title="Review Queue"
        description={
          statusFilter === "recently_completed"
            ? `${rows.length} recently completed jobs`
            : `${rows.length} items requiring review`
        }
        flush
      >
        <CompactTable
          columns={columns}
          data={rows}
          loading={isLoading}
          emptyMessage="No jobs in the closure review queue."
          onRowClick={(row) => navigate(`/jobs/${row.id}`)}
        />
      </ControlSection>
    </ControlShell>
  );
}
