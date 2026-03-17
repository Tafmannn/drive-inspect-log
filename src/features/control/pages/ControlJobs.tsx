/**
 * Jobs Control Page — /control/jobs
 * Primary dispatch workspace with search, filters, sort, and contextual actions.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { CompactTable } from "../components/shared/CompactTable";
import { FilterBar } from "../components/shared/FilterBar";
import { useControlJobs, useJobsKpis, type JobsFilter } from "../hooks/useControlJobsData";
import { AssignDriverModal } from "../components/AssignDriverModal";
import { buildJobColumns, type JobsColumnActions } from "./jobs/JobsColumns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Plus, Truck, ClipboardCheck, UserX, LayoutList, Clock, ArrowUpDown,
} from "lucide-react";

type StatusFilter = JobsFilter["status"];
type SortMode = NonNullable<JobsFilter["sort"]>;

const STATUS_OPTIONS: { label: string; value: StatusFilter; icon?: React.ComponentType<{ className?: string }> }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "POD Review", value: "pod_review" },
  { label: "Unassigned", value: "unassigned" },
  { label: "Stale", value: "stale" },
  { label: "Completed", value: "completed" },
];

export function ControlJobs() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (searchParams.get("status") as StatusFilter) || "all"
  );
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [assignTarget, setAssignTarget] = useState<{ jobId: string; jobRef: string; driverId: string | null } | null>(null);

  const filter: JobsFilter = useMemo(
    () => ({ search, status: statusFilter, sort: sortMode }),
    [search, statusFilter, sortMode]
  );
  const { data: jobs, isLoading, error } = useControlJobs(filter);
  const { data: kpis, isLoading: kpisLoading } = useJobsKpis();

  // Column action callbacks — stable references
  const columnActions: JobsColumnActions = useMemo(() => ({
    onView: (r) => navigate(`/jobs/${r.id}?from=/control/jobs`),
    onAssign: (r) => setAssignTarget({
      jobId: r.id,
      jobRef: r.external_job_number || r.id.slice(0, 8),
      driverId: r.driver_id ?? null,
    }),
    onReviewPod: (r) => navigate(`/jobs/${r.id}/pod?from=/control/jobs`),
    onAddExpense: (r) => navigate(`/expenses/new?jobId=${r.id}&from=/control/jobs`),
  }), [navigate]);

  const columns = useMemo(() => buildJobColumns(columnActions), [columnActions]);

  const toggleSort = useCallback(() => {
    setSortMode((prev) => (prev === "updated" ? "date" : "updated"));
  }, []);

  const kpiItems = [
    { label: "Total Jobs", value: kpis?.total, icon: LayoutList, variant: "default" as const, loading: kpisLoading },
    { label: "Active", value: kpis?.active, icon: Truck, variant: "info" as const, loading: kpisLoading },
    { label: "POD Review", value: kpis?.podReview, icon: ClipboardCheck, variant: "warning" as const, loading: kpisLoading },
    { label: "Unassigned", value: kpis?.unassigned, icon: UserX, variant: kpis?.unassigned ? "destructive" as const : "default" as const, loading: kpisLoading },
    { label: "Stale (>24h)", value: kpis?.stale, icon: Clock, variant: kpis?.stale ? "warning" as const : "default" as const, loading: kpisLoading },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Jobs"
        subtitle="Dispatch workspace — filter, prioritise, and progress jobs"
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => navigate("/jobs/new")}>
            <Plus className="h-3.5 w-3.5" /> New Job
          </Button>
        }
      />

      {/* KPI Strip */}
      <KpiStrip items={kpiItems} className="grid-cols-2 lg:grid-cols-5" />

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

        {/* Status quick-filters */}
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

        {/* Sort toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-8 gap-1 ml-auto"
          onClick={toggleSort}
        >
          <ArrowUpDown className="h-3 w-3" />
          {sortMode === "updated" ? "By updated" : "By job date"}
        </Button>
      </FilterBar>

      {/* Jobs Table */}
      <ControlSection
        title="Jobs"
        description={
          error
            ? "Failed to load jobs — check your connection and try again."
            : `${jobs?.length ?? 0} jobs matching current filters`
        }
        flush
      >
        {error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-destructive mb-2">
              {error instanceof Error ? error.message : "Unknown error loading jobs."}
            </p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : (
          <CompactTable
            columns={columns}
            data={jobs ?? []}
            loading={isLoading}
            emptyMessage="No jobs match your filters."
            onRowClick={(row) => navigate(`/jobs/${row.id}`)}
          />
        )}
      </ControlSection>

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
