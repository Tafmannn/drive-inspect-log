/**
 * Jobs — /control/jobs
 *
 * The one jobs screen for admins and the owner, on every screen size. It
 * merges the old mobile queue (/admin/jobs) and the old desktop table:
 *   - "Queues" (default): triage sections — needs attention, unassigned,
 *     missing evidence (with "Mark resolved"), in progress, POD review,
 *     recently completed;
 *   - list views (unassigned, stale, active, POD review, completed,
 *     cancelled, all) read the server-filtered list and can be sorted;
 *   - cards below 1024px, a dense table above (ResponsiveList);
 *   - run order planning, new job, clickable KPIs;
 *   - the view and search live in the URL, so links and Back return here.
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { ViewChips } from "../components/shared/ViewChips";
import { ResponsiveList } from "../components/shared/ResponsiveList";
import { useControlJobs, useJobsKpis, type JobControlRow, type JobsFilter } from "../hooks/useControlJobsData";
import { AssignDriverModal } from "../components/AssignDriverModal";
import { RunOrderModal } from "../components/RunOrderModal";
import { buildJobColumns, type JobsColumnActions } from "./jobs/JobsColumns";
import {
  JOBS_VIEWS, jobsViewDef, jobsViewUrl, matchesJobSearch, resolveJobsView, type JobsView,
} from "./jobs/jobsView";
import { AdminJobCard } from "@/components/AdminJobCard";
import { useAdminJobQueues } from "@/hooks/useAdminJobQueues";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { useEvidenceAckRealtime } from "@/hooks/useEvidenceAckRealtime";
import { acknowledgeMissingEvidence } from "@/lib/evidenceAckApi";
import { invalidateAdminOperationalQueues } from "@/lib/mutationEvents";
import { qk } from "@/lib/queryKeys";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Search, Plus, Truck, ClipboardCheck, UserX, LayoutList, Clock, ArrowUpDown,
  AlertTriangle, ImageOff, CheckCircle, ListOrdered, ShieldCheck,
} from "lucide-react";

type SortMode = NonNullable<JobsFilter["sort"]>;

function queryFor(v: JobsView, term: string): URLSearchParams {
  return new URLSearchParams(jobsViewUrl(v, term).split("?")[1] ?? "");
}

const REFETCH_KEYS = [qk.jobs.adminQueues(), qk.jobs.controlKpis(), ["jobs", "control", "list"]];

export function ControlJobs() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the source of truth for the view and the search term.
  const view = resolveJobsView(searchParams);
  const def = jobsViewDef(view);
  const search = searchParams.get("search") ?? "";
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [assignTarget, setAssignTarget] = useState<{ jobId: string; jobRef: string; driverId: string | null } | null>(null);
  const [runOrderOpen, setRunOrderOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Translate old ?status= / ?filter= links into ?view= (once, without a history entry).
  useEffect(() => {
    const canonical = queryFor(view, search).toString();
    if (canonical !== searchParams.toString()) setSearchParams(queryFor(view, search), { replace: true });
  }, [view, search, searchParams, setSearchParams]);

  const setView = useCallback(
    (next: JobsView) => setSearchParams(queryFor(next, search)),
    [search, setSearchParams],
  );
  const setSearch = useCallback(
    (term: string) => setSearchParams(queryFor(view, term), { replace: true }),
    [view, setSearchParams],
  );

  // Data: queue views read the grouped triage data, list views the server list.
  const queues = useAdminJobQueues();
  const listFilter: JobsFilter = useMemo(
    () => ({ search, status: def.listStatus ?? "all", sort: sortMode }),
    [search, def.listStatus, sortMode],
  );
  const list = useControlJobs(listFilter);
  const { data: kpis, isLoading: kpisLoading } = useJobsKpis();
  useRefetchOnFocus(REFETCH_KEYS);
  useEvidenceAckRealtime();

  // Where detail pages send the user back to.
  const from = encodeURIComponent(jobsViewUrl(view, search));

  const openAssign = useCallback((r: { id: string; external_job_number: string | null; driver_id: string | null }) => {
    setAssignTarget({ jobId: r.id, jobRef: r.external_job_number || r.id.slice(0, 8), driverId: r.driver_id ?? null });
  }, []);
  const onView = useCallback((r: { id: string }) => navigate(`/jobs/${r.id}?from=${from}`), [navigate, from]);
  const onPod = useCallback((r: { id: string }) => navigate(`/jobs/${r.id}/pod?from=${from}`), [navigate, from]);
  const onExpense = useCallback(
    (r: { id: string }) => navigate(`/expenses/new?jobId=${r.id}&from=${from}`),
    [navigate, from],
  );

  const resolveEvidence = useCallback(
    async (job: JobControlRow) => {
      const ref = job.external_job_number || `Job ${job.id.slice(0, 8)}`;
      const ok = await confirm({
        title: `Remove ${ref} from Missing Evidence queue?`,
        description:
          "This records an admin acknowledgement and hides the job from this queue. It does not change the job status or evidence on file.",
        confirmLabel: "Confirm Removal",
        cancelLabel: "Cancel",
        tone: "danger",
      });
      if (!ok) return;
      setResolvingId(job.id);
      try {
        await acknowledgeMissingEvidence(job.id);
        invalidateAdminOperationalQueues(qc, job.id);
        toast({ title: `${ref} removed from Missing Evidence queue.` });
      } catch (err) {
        toast({
          title: "Couldn't dismiss this job.",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setResolvingId(null);
      }
    },
    [confirm, qc],
  );

  const baseActions: JobsColumnActions = useMemo(
    () => ({ onView, onAssign: openAssign, onReviewPod: onPod, onAddExpense: onExpense }),
    [onView, openAssign, onPod, onExpense],
  );
  const columns = useMemo(() => buildJobColumns(baseActions), [baseActions]);
  const evidenceColumns = useMemo(
    () => buildJobColumns({ ...baseActions, onResolveEvidence: (r) => void resolveEvidence(r), resolvingId }),
    [baseActions, resolveEvidence, resolvingId],
  );

  const renderCard = useCallback(
    (job: JobControlRow, evidence = false) => (
      <AdminJobCard
        job={job}
        onView={onView}
        onAssign={openAssign}
        onPod={onPod}
        onExpense={onExpense}
        footer={
          evidence ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full min-h-[40px] text-xs gap-1"
              disabled={resolvingId === job.id}
              onClick={() => void resolveEvidence(job)}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {resolvingId === job.id ? "Removing…" : "Mark resolved"}
            </Button>
          ) : undefined
        }
      />
    ),
    [onView, openAssign, onPod, onExpense, resolvingId, resolveEvidence],
  );

  const filterRows = useCallback((rows: JobControlRow[]) => rows.filter((r) => matchesJobSearch(r, search)), [search]);

  const missingEvidenceCount = queues.data?.missingEvidence.length;
  const kpiItems = [
    { label: "Unassigned", value: kpis?.unassigned, icon: UserX, variant: kpis?.unassigned ? ("destructive" as const) : ("default" as const), loading: kpisLoading, onClick: () => setView("unassigned") },
    { label: "Stale (>24h)", value: kpis?.stale, icon: Clock, variant: kpis?.stale ? ("warning" as const) : ("default" as const), loading: kpisLoading, onClick: () => setView("stale") },
    { label: "Evidence gaps", value: missingEvidenceCount, icon: ImageOff, variant: missingEvidenceCount ? ("destructive" as const) : ("default" as const), loading: queues.isLoading, onClick: () => setView("evidence") },
    { label: "POD Review", value: kpis?.podReview, icon: ClipboardCheck, variant: "warning" as const, loading: kpisLoading, onClick: () => setView("review") },
    { label: "Active", value: kpis?.active, icon: Truck, variant: "info" as const, loading: kpisLoading, onClick: () => setView("active") },
    { label: "Total jobs", value: kpis?.total, icon: LayoutList, variant: "default" as const, loading: kpisLoading, onClick: () => setView("all") },
  ];

  const activeQuery = def.source === "queue" ? queues : list;
  const loadError = activeQuery.error;

  return (
    <ControlShell>
      <ControlHeader
        title="Jobs"
        subtitle="Triage, dispatch and progress jobs"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 min-h-[40px] lg:min-h-0"
              onClick={() => setRunOrderOpen(true)}
              aria-label="Set driver run order"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Run order</span>
            </Button>
            <Button
              size="sm"
              className="gap-1.5 min-h-[40px] lg:min-h-0"
              onClick={() => navigate(`/jobs/new?from=${from}`)}
            >
              <Plus className="h-3.5 w-3.5" /> New job
            </Button>
          </>
        }
      />

      <KpiStrip items={kpiItems} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" />

      {/* Search + views */}
      <div className="rounded-lg border bg-card px-3 py-2.5 space-y-2 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-2">
        <div className="relative lg:flex-1 lg:min-w-[200px] lg:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 lg:h-3.5 lg:w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search reg, client, driver, postcode…"
            className="pl-9 lg:pl-8 h-11 lg:h-8 text-sm lg:text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search jobs"
          />
        </div>
        <ViewChips options={JOBS_VIEWS} value={view} onChange={setView} ariaLabel="Job views" />
        {def.source === "list" && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-10 lg:h-8 gap-1 lg:ml-auto"
            onClick={() => setSortMode((p) => (p === "updated" ? "date" : "updated"))}
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortMode === "updated" ? "By updated" : "By job date"}
          </Button>
        )}
      </div>

      {loadError ? (
        <ControlSection>
          <div className="py-6 text-center">
            <p className="text-sm text-destructive mb-2">
              Failed to load jobs: {loadError instanceof Error ? loadError.message : "Unknown error"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void activeQuery.refetch()}>
              Retry
            </Button>
          </div>
        </ControlSection>
      ) : def.source === "list" ? (
        <ControlSection
          title={def.label}
          description={list.isLoading ? "Loading…" : `${list.data?.length ?? 0} jobs`}
          flush
        >
          <ResponsiveList<JobControlRow>
            rows={list.data ?? []}
            columns={columns}
            loading={list.isLoading}
            emptyMessage="No jobs match your filters."
            onRowClick={onView}
            renderCard={(r) => renderCard(r)}
          />
        </ControlSection>
      ) : (
        <>
          {queues.data?.truncated && (
            <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-warning">
                Showing the most recently updated 300 jobs. Older jobs may be missing from these queues; the
                counts above are complete.
              </p>
            </div>
          )}
          {(view === "queues" || view === "attention") && (
            <QueueSection
              title="Needs attention"
              icon={AlertTriangle}
              iconClass="text-warning"
              rows={filterRows(queues.data?.needsAttention ?? [])}
              loading={queues.isLoading}
              emptyText="No jobs need attention."
              columns={columns}
              onRowClick={onView}
              renderCard={(r) => renderCard(r)}
            />
          )}
          {view === "queues" && (
            <QueueSection
              title="Unassigned"
              icon={UserX}
              iconClass="text-destructive"
              rows={filterRows(queues.data?.unassigned ?? [])}
              loading={queues.isLoading}
              emptyText="All jobs are assigned."
              columns={columns}
              onRowClick={onView}
              renderCard={(r) => renderCard(r)}
            />
          )}
          {(view === "queues" || view === "evidence") && (
            <QueueSection
              title="Missing evidence"
              icon={ImageOff}
              iconClass="text-destructive"
              rows={filterRows(queues.data?.missingEvidence ?? [])}
              loading={queues.isLoading}
              emptyText="No evidence gaps found."
              columns={evidenceColumns}
              onRowClick={onView}
              renderCard={(r) => renderCard(r, true)}
            />
          )}
          {view === "queues" && (
            <>
              <QueueSection
                title="In progress"
                icon={Truck}
                iconClass="text-primary"
                rows={filterRows(queues.data?.inProgress ?? [])}
                loading={queues.isLoading}
                emptyText="No active jobs with assigned drivers."
                columns={columns}
                onRowClick={onView}
                renderCard={(r) => renderCard(r)}
              />
              <QueueSection
                title="POD review"
                icon={ClipboardCheck}
                iconClass="text-info"
                rows={filterRows(queues.data?.review ?? [])}
                loading={queues.isLoading}
                emptyText="No jobs pending review."
                columns={columns}
                onRowClick={onView}
                renderCard={(r) => renderCard(r)}
              />
              <QueueSection
                title="Recently completed"
                icon={CheckCircle}
                iconClass="text-success"
                rows={filterRows(queues.data?.completed ?? [])}
                loading={queues.isLoading}
                emptyText="No recently completed jobs."
                columns={columns}
                onRowClick={onView}
                renderCard={(r) => renderCard(r)}
                collapsible
              />
            </>
          )}
        </>
      )}

      <RunOrderModal open={runOrderOpen} onOpenChange={setRunOrderOpen} />

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

function QueueSection({
  title,
  icon: Icon,
  iconClass,
  rows,
  loading,
  emptyText,
  columns,
  onRowClick,
  renderCard,
  collapsible,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  rows: JobControlRow[];
  loading: boolean;
  emptyText: string;
  columns: ReturnType<typeof buildJobColumns>;
  onRowClick: (r: JobControlRow) => void;
  renderCard: (r: JobControlRow) => React.ReactNode;
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(!!collapsible);
  return (
    <section className="rounded-lg border bg-card" aria-label={title}>
      <button
        type="button"
        className={cn("flex items-center gap-2 w-full text-left px-4 py-3 min-h-[44px]", !collapsible && "cursor-default")}
        onClick={() => collapsible && setCollapsed((c) => !c)}
        aria-expanded={collapsible ? !collapsed : undefined}
      >
        <Icon className={cn("h-4 w-4", iconClass ?? "text-muted-foreground")} />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-[11px] font-medium text-muted-foreground">({loading ? "…" : rows.length})</span>
        {collapsible && (
          <span className="text-[11px] text-muted-foreground ml-auto">{collapsed ? "Show" : "Hide"}</span>
        )}
      </button>
      {!collapsed && (
        <ResponsiveList<JobControlRow>
          rows={rows}
          columns={columns}
          loading={loading}
          emptyMessage={emptyText}
          onRowClick={onRowClick}
          renderCard={renderCard}
        />
      )}
    </section>
  );
}
