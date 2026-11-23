/**
 * POD Review — /control/pod-review
 *
 * The one closure screen for admins and the owner, on every screen size.
 * Merges the old mobile page (/admin/pod-review: evidence groups, signature
 * checks) and the old desktop table (status filters, server KPIs, stale cue):
 *   - "Review queue" (default) groups the queue by evidence: missing delivery
 *     inspection, missing signatures, ready to confirm; recently completed
 *     sits underneath, collapsed;
 *   - flat views by evidence or status;
 *   - Confirm completes the job through the validated server RPC;
 *   - cards below 1024px, a table above; view and search live in the URL.
 *
 * ACTIONS: View → /jobs/:id · Review POD → /jobs/:id/pod ·
 * Inspect → /inspection/:id/delivery · Confirm → completeJobRpc
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { ViewChips } from "../components/shared/ViewChips";
import { ResponsiveList } from "../components/shared/ResponsiveList";
import type { CompactColumn } from "../components/shared/CompactTable";
import {
  useClosureReviewQueue,
  useClosureKpis,
  selectClosureRows,
  type ClosureReviewRow,
  type ClosureStatusFilter,
} from "../hooks/useClosureReview";
import { POD_VIEWS, canConfirmReview, podViewQuery, podViewUrl, resolvePodView } from "./pod/podView";
import { PodReviewCard, EvidenceCues, type PodReviewActions } from "./pod/PodReviewCard";
import { humanAge } from "./jobs/jobsUtils";
import { UKPlate } from "@/components/UKPlate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStatusStyle } from "@/lib/statusConfig";
import { invalidateForEvent } from "@/lib/mutationEvents";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Search, ClipboardCheck, FileCheck, Truck, AlertTriangle, PenTool,
  Eye, FileText, ClipboardList, CheckCircle, Loader2,
} from "lucide-react";

const REFETCH_KEYS = [["closure-review-queue"], ["closure-review-kpis"]];

function buildColumns(a: PodReviewActions): CompactColumn<ClosureReviewRow>[] {
  return [
    {
      key: "ref",
      header: "Ref",
      className: "w-[100px]",
      render: (r) => <span className="text-xs font-semibold text-foreground">{r.external_job_number || r.id.slice(0, 8)}</span>,
    },
    {
      key: "vehicle",
      header: "Vehicle",
      className: "w-[130px]",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <UKPlate size="table" reg={r.vehicle_reg} />
          <span className="text-[10px] text-muted-foreground truncate">
            {[r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ")}
          </span>
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      className: "w-[120px]",
      render: (r) => (
        <span className="text-xs text-foreground truncate block max-w-[120px]">{r.client_company || r.client_name || "—"}</span>
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
        <span className="text-xs text-muted-foreground whitespace-nowrap">{r.delivery_city || r.delivery_postcode}</span>
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
      className: "w-[170px]",
      render: (r) => <EvidenceCues row={r} compact />,
    },
    {
      key: "age",
      header: "Age",
      className: "w-[55px] text-right",
      render: (r) => <span className="text-[11px] text-muted-foreground tabular-nums">{humanAge(r.completed_at ?? r.updated_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      className: "w-[230px] text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          {canConfirmReview(r) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-primary"
              disabled={a.confirmingId === r.id}
              onClick={(e) => { e.stopPropagation(); a.onConfirm(r); }}
            >
              {a.confirmingId === r.id ? <Loader2 className="h-3 w-3 animate-spin mr-0.5" /> : <CheckCircle className="h-3 w-3 mr-0.5" />} Confirm
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); a.onPod(r); }}>
            <FileText className="h-3 w-3 mr-0.5" /> POD
          </Button>
          {r.missingDeliveryInspection && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-warning" onClick={(e) => { e.stopPropagation(); a.onInspect(r); }}>
              <ClipboardList className="h-3 w-3 mr-0.5" /> Inspect
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); a.onView(r); }}>
            <Eye className="h-3 w-3 mr-0.5" /> View
          </Button>
        </div>
      ),
    },
  ];
}

export function ControlPodReview() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolvePodView(searchParams);
  const search = searchParams.get("search") ?? "";
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Translate old ?filter= links into ?view= without a history entry.
  useEffect(() => {
    const canonical = podViewQuery(view, search);
    if (canonical.toString() !== searchParams.toString()) setSearchParams(canonical, { replace: true });
  }, [view, search, searchParams, setSearchParams]);

  const setView = useCallback((v: ClosureStatusFilter) => setSearchParams(podViewQuery(v, search)), [search, setSearchParams]);
  const setSearch = useCallback(
    (term: string) => setSearchParams(podViewQuery(view, term), { replace: true }),
    [view, setSearchParams],
  );

  const { data, isLoading, error, refetch } = useClosureReviewQueue();
  const { data: kpis, isLoading: kpisLoading } = useClosureKpis();
  useRefetchOnFocus(REFETCH_KEYS);

  const from = encodeURIComponent(podViewUrl(view, search));

  const onConfirm = useCallback(
    async (row: ClosureReviewRow) => {
      setConfirmingId(row.id);
      try {
        // Validated server-side completion — never write status directly.
        const { completeJobRpc } = await import("@/lib/api");
        await completeJobRpc(row.id, "Confirmed via POD review");
        toast({ title: "Review confirmed — job completed" });
        invalidateForEvent(qc, "pod_approved", [["job", row.id]]);
      } catch (e) {
        toast({ title: "Couldn't confirm", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
      } finally {
        setConfirmingId(null);
      }
    },
    [qc],
  );

  const actions: PodReviewActions = useMemo(
    () => ({
      onView: (r) => navigate(`/jobs/${r.id}?from=${from}`),
      onPod: (r) => navigate(`/jobs/${r.id}/pod?from=${from}`),
      onInspect: (r) => navigate(`/inspection/${r.id}/delivery`),
      onConfirm: (r) => void onConfirm(r),
      confirmingId,
    }),
    [navigate, from, onConfirm, confirmingId],
  );
  const columns = useMemo(() => buildColumns(actions), [actions]);
  const renderCard = useCallback((r: ClosureReviewRow) => <PodReviewCard row={r} actions={actions} />, [actions]);

  const rowsFor = useCallback((f: ClosureStatusFilter) => selectClosureRows(data, f, search), [data, search]);
  const missingSignatures = data?.queue.filter((r) => r.evidence === "missing_signatures").length;
  const ready = data?.queue.filter((r) => r.evidence === "complete").length;

  const kpiItems = [
    { label: "Review queue", value: kpis?.reviewQueue, icon: ClipboardCheck, variant: "warning" as const, loading: kpisLoading, onClick: () => setView("all") },
    { label: "Ready to confirm", value: ready, icon: CheckCircle, variant: "success" as const, loading: isLoading, onClick: () => setView("ready") },
    { label: "Missing signatures", value: missingSignatures, icon: PenTool, variant: missingSignatures ? ("warning" as const) : ("default" as const), loading: isLoading, onClick: () => setView("missing_signatures") },
    { label: "No delivery insp.", value: kpis?.missingDeliveryInspection, icon: AlertTriangle, variant: kpis?.missingDeliveryInspection ? ("destructive" as const) : ("default" as const), loading: kpisLoading, onClick: () => setView("missing_delivery_inspection") },
    { label: "POD ready", value: kpis?.podReady, icon: FileCheck, variant: "info" as const, loading: kpisLoading, onClick: () => setView("pod_ready") },
    { label: "Delivery complete", value: kpis?.deliveryComplete, icon: Truck, variant: "default" as const, loading: kpisLoading, onClick: () => setView("delivery_complete") },
  ];

  const viewLabel = POD_VIEWS.find((v) => v.value === view)?.label ?? "Review queue";

  return (
    <ControlShell>
      <ControlHeader title="POD Review" subtitle="Check evidence, confirm deliveries and close jobs" />

      <KpiStrip items={kpiItems} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" />

      <div className="rounded-lg border bg-card px-3 py-2.5 space-y-2 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-2">
        <div className="relative lg:flex-1 lg:min-w-[200px] lg:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 lg:h-3.5 lg:w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search reg, driver, client, postcode…"
            className="pl-9 lg:pl-8 h-11 lg:h-8 text-sm lg:text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search POD review"
          />
        </div>
        <ViewChips options={POD_VIEWS} value={view} onChange={setView} ariaLabel="POD review views" />
      </div>

      {error ? (
        <ControlSection>
          <div className="py-6 text-center">
            <p className="text-sm text-destructive mb-2">
              Failed to load: {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
          </div>
        </ControlSection>
      ) : view === "all" ? (
        <>
          <Group title="Missing delivery inspection" icon={ClipboardList} iconClass="text-destructive"
            rows={rowsFor("missing_delivery_inspection")} loading={isLoading}
            emptyText="All closure jobs have a delivery inspection." columns={columns} onRowClick={actions.onView} renderCard={renderCard} />
          <Group title="Missing signatures" icon={PenTool} iconClass="text-warning"
            rows={rowsFor("missing_signatures")} loading={isLoading}
            emptyText="All inspected jobs have both signatures." columns={columns} onRowClick={actions.onView} renderCard={renderCard} />
          <Group title="Ready to confirm" icon={FileCheck} iconClass="text-primary"
            rows={rowsFor("ready")} loading={isLoading}
            emptyText="No jobs with complete evidence waiting." columns={columns} onRowClick={actions.onView} renderCard={renderCard} />
          <Group title="Recently completed (7d)" icon={CheckCircle} iconClass="text-success"
            rows={rowsFor("recently_completed")} loading={isLoading}
            emptyText="No recently completed jobs." columns={columns} onRowClick={actions.onView} renderCard={renderCard} collapsible />
        </>
      ) : (
        <ControlSection
          title={viewLabel}
          description={isLoading ? "Loading…" : `${rowsFor(view).length} jobs`}
          flush
        >
          <ResponsiveList<ClosureReviewRow>
            rows={rowsFor(view)}
            columns={columns}
            loading={isLoading}
            emptyMessage="No jobs in this view."
            onRowClick={actions.onView}
            renderCard={renderCard}
          />
        </ControlSection>
      )}
    </ControlShell>
  );
}

function Group({
  title, icon: Icon, iconClass, rows, loading, emptyText, columns, onRowClick, renderCard, collapsible,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  rows: ClosureReviewRow[];
  loading: boolean;
  emptyText: string;
  columns: CompactColumn<ClosureReviewRow>[];
  onRowClick: (r: ClosureReviewRow) => void;
  renderCard: (r: ClosureReviewRow) => React.ReactNode;
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
        {collapsible && <span className="text-[11px] text-muted-foreground ml-auto">{collapsed ? "Show" : "Hide"}</span>}
      </button>
      {!collapsed && (
        <ResponsiveList<ClosureReviewRow>
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
