/**
 * Jobs Control Page — /control/jobs
 * Primary dispatch workspace with search, filters, and inline actions.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { StatusChip } from "../components/shared/StatusChip";
import { FilterBar } from "../components/shared/FilterBar";
import { useControlJobs, useJobsKpis, type JobControlRow, type JobsFilter } from "../hooks/useControlJobsData";
import { UKPlate } from "@/components/UKPlate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStatusStyle } from "@/lib/statusConfig";
import {
  Search, Plus, Truck, ClipboardCheck, UserX, LayoutList,
  Eye, UserPlus, FileText, Receipt,
} from "lucide-react";

type StatusFilter = JobsFilter["status"];

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "POD Review", value: "pod_review" },
  { label: "Unassigned", value: "unassigned" },
  { label: "Completed", value: "completed" },
];

function humanAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function ControlJobs() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filter: JobsFilter = useMemo(() => ({ search, status: statusFilter }), [search, statusFilter]);
  const { data: jobs, isLoading } = useControlJobs(filter);
  const { data: kpis, isLoading: kpisLoading } = useJobsKpis();

  const kpiItems = [
    { label: "Total Jobs", value: kpis?.total, icon: LayoutList, variant: "default" as const, loading: kpisLoading },
    { label: "Active", value: kpis?.active, icon: Truck, variant: "info" as const, loading: kpisLoading },
    { label: "POD Review", value: kpis?.podReview, icon: ClipboardCheck, variant: "warning" as const, loading: kpisLoading },
    { label: "Unassigned", value: kpis?.unassigned, icon: UserX, variant: kpis?.unassigned ? "destructive" as const : "default" as const, loading: kpisLoading },
  ];

  const columns: CompactColumn<JobControlRow>[] = [
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
      key: "client",
      header: "Client",
      className: "w-[120px]",
      render: (r) => (
        <span className="text-xs text-foreground truncate block max-w-[120px]">
          {r.client_company || r.client_name || "—"}
        </span>
      ),
    },
    {
      key: "driver",
      header: "Driver",
      className: "w-[110px]",
      render: (r) =>
        r.driver_name ? (
          <span className="text-xs text-foreground">{r.driver_name}</span>
        ) : (
          <span className="text-xs font-medium text-warning">Unassigned</span>
        ),
    },
    {
      key: "route",
      header: "Route",
      render: (r) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
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
      className: "w-[65px] text-right",
      render: (r) => (
        <span className="text-[11px] text-muted-foreground">{humanAge(r.updated_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[140px] text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${r.id}`); }}
          >
            <Eye className="h-3 w-3 mr-0.5" /> View
          </Button>
          {!r.driver_name && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-warning"
              onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${r.id}/edit`); }}
            >
              <UserPlus className="h-3 w-3 mr-0.5" /> Assign
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Jobs"
        subtitle="Manage, monitor, and control all vehicle movement jobs"
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => navigate("/jobs/new")}>
            <Plus className="h-3.5 w-3.5" /> New Job
          </Button>
        }
      />

      {/* KPI Strip */}
      <KpiStrip items={kpiItems} className="grid-cols-2 lg:grid-cols-4" />

      {/* Filter Bar */}
      <FilterBar>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search reg, client, driver, postcode…"
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

      {/* Jobs Table */}
      <ControlSection
        title="Jobs"
        description={`${jobs?.length ?? 0} jobs matching current filters`}
        flush
      >
        <CompactTable
          columns={columns}
          data={jobs ?? []}
          loading={isLoading}
          emptyMessage="No jobs match your filters."
          onRowClick={(row) => navigate(`/jobs/${row.id}`)}
        />
      </ControlSection>
    </ControlShell>
  );
}
