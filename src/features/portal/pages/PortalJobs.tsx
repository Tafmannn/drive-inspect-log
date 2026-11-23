import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Download, Plus, ReceiptPoundSterling, Search, SlidersHorizontal, Truck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePortalContext, usePortalInvoices, usePortalJobs, type PortalJobSummary } from "../api";
import { STAGE_LABEL, isActiveStage, portalStage, type PortalStage } from "../lib/portalStatus";
import { fmtDate, fmtGbp } from "../lib/format";
import { invoiceBalance } from "../lib/invoiceStatus";
import { downloadCsv, toCsv } from "../lib/csv";
import { usePortalTitle } from "../lib/usePortalTitle";
import { requestMoveMailto } from "../lib/contact";
import { MovementCard } from "../components/MovementCard";
import { place, vehicleLine } from "../lib/moveText";
import {
  CardListSkeleton,
  EmptyState,
  ErrorState,
  MetricCard,
  PortalHero,
  SegmentedTabs,
  TransporterArt,
} from "../components/PortalUi";

type Tab = "active" | "completed";
type Range = "30" | "90" | "365" | "all";

const RANGE_LABEL: Record<Range, string> = {
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last 12 months",
  all: "All time",
};

/** When the move finished (or was booked, if it never completed). */
function finishedAt(j: PortalJobSummary): string {
  return j.completed_at ?? j.created_at;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function PortalJobs() {
  const { data: jobs, isLoading, error, dataUpdatedAt, refetch } = usePortalJobs();
  const invoicesQuery = usePortalInvoices();
  const { data: ctx } = usePortalContext();
  const [params, setParams] = useSearchParams();

  // Tab, search, status and date range live in the URL so "Back" from a move
  // returns the client to exactly the list they left.
  const tab: Tab = params.get("tab") === "completed" ? "completed" : "active";
  const search = params.get("q") ?? "";
  const rangeParam = params.get("range");
  const range: Range = rangeParam === "30" || rangeParam === "90" || rangeParam === "365" ? rangeParam : "all";
  const stageFilter = (params.get("stage") as PortalStage | null) ?? null;
  const setParam = (key: string, value: string | null, also?: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries({ [key]: value, ...also })) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  usePortalTitle("Vehicle moves", ctx?.operator.name);

  const { active, completed } = useMemo(() => {
    const a: PortalJobSummary[] = [];
    const c: PortalJobSummary[] = [];
    for (const j of jobs ?? []) (isActiveStage(portalStage(j.status)) ? a : c).push(j);
    // Soonest scheduled first for live moves; most recent first for history.
    a.sort((x, y) => (x.job_date ?? "9999").localeCompare(y.job_date ?? "9999"));
    c.sort((x, y) => finishedAt(y).localeCompare(finishedAt(x)));
    return { active: a, completed: c };
  }, [jobs]);

  const delivered = useMemo(() => completed.filter((j) => portalStage(j.status) === "delivered"), [completed]);
  const deliveredThisMonth = useMemo(() => {
    const now = new Date();
    return delivered.filter((j) => {
      if (!j.completed_at) return false;
      const d = new Date(j.completed_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [delivered]);

  const balance = useMemo(() => invoiceBalance(invoicesQuery.data ?? []), [invoicesQuery.data]);

  // Status options are the stages actually present in this tab — never a
  // made-up list.
  const tabJobs = tab === "active" ? active : completed;
  const stageOptions = useMemo(() => {
    const seen = new Set<PortalStage>();
    for (const j of tabJobs) seen.add(portalStage(j.status));
    return [...seen];
  }, [tabJobs]);
  const activeStage = stageFilter && stageOptions.includes(stageFilter) ? stageFilter : null;

  const list = useMemo(() => {
    let base = tabJobs;
    if (tab === "completed" && range !== "all") {
      const cutoff = Date.now() - Number(range) * 86_400_000;
      base = base.filter((j) => new Date(finishedAt(j)).getTime() >= cutoff);
    }
    if (activeStage) base = base.filter((j) => portalStage(j.status) === activeStage);
    const s = search.trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return base;
    return base.filter((j) =>
      [j.vehicle_reg, j.job_ref, j.vehicle_make, j.vehicle_model, j.pickup_city, j.delivery_city, j.pickup_postcode, j.delivery_postcode]
        .some((v) => v?.toLowerCase().replace(/\s+/g, "").includes(s)),
    );
  }, [tabJobs, tab, search, range, activeStage]);

  const requestHref = ctx ? requestMoveMailto(ctx) : null;
  const filterCount = (activeStage ? 1 : 0) + (tab === "completed" && range !== "all" ? 1 : 0);
  const back = `/portal${params.toString() ? `?${params}` : ""}`;

  const exportCsv = () => {
    const rows = list.map((j) => {
      const stage = portalStage(j.status);
      return [
        j.job_ref,
        j.vehicle_reg,
        vehicleLine(j),
        place(j.pickup_city, j.pickup_postcode),
        place(j.delivery_city, j.delivery_postcode),
        j.job_date ?? "",
        stage === "delivered" && j.completed_at ? j.completed_at.slice(0, 10) : "",
        STAGE_LABEL[stage],
      ];
    });
    const csv = toCsv(["Reference", "Registration", "Vehicle", "From", "To", "Scheduled", "Delivered", "Status"], rows);
    downloadCsv(`vehicle-moves-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const updated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  // Moves state for the metric cards: a failed or pending load never reads as 0.
  const movesState = isLoading ? "loading" : error ? "error" : "ready";
  const invoiceState = invoicesQuery.isLoading ? "loading" : invoicesQuery.error ? "error" : "ready";
  const overdue = balance.overdueCount > 0;
  let paymentHint = "All paid up";
  if (overdue) paymentHint = `${fmtGbp(balance.overdue)} overdue`;
  else if (balance.outstandingCount)
    paymentHint = balance.nextDue ? `Next due ${fmtDate(balance.nextDue)}` : `${plural(balance.outstandingCount, "unpaid invoice")}`;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PortalHero
        eyebrow={ctx?.client.name}
        title="Vehicle moves"
        subtitle="Track your vehicle collections, deliveries and completed movements."
      />

      {requestHref && (
        <Button
          asChild
          className="h-11 w-full rounded-xl bg-[#1E4FA8] text-[15px] font-semibold shadow-[0_1px_2px_rgb(30_79_168/0.25),0_6px_16px_-8px_rgb(30_79_168/0.6)] hover:bg-[#1a4594] active:scale-[0.99] motion-reduce:transform-none sm:w-auto sm:px-5"
        >
          <a href={requestHref}>
            <Plus className="mr-1.5 h-[18px] w-[18px]" aria-hidden /> Request a move
          </a>
        </Button>
      )}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard
          icon={Truck}
          tone="blue"
          label="In progress"
          value={String(active.length)}
          state={movesState}
          hint={active.length ? "Moving or scheduled" : "Nothing on the road right now"}
        />
        <MetricCard
          icon={CheckCircle2}
          tone="green"
          label="Delivered this month"
          value={String(deliveredThisMonth)}
          state={movesState}
          hint={`${delivered.length} delivered in total`}
        />
        <MetricCard
          className="col-span-2 lg:col-span-1"
          icon={overdue ? AlertTriangle : ReceiptPoundSterling}
          tone={overdue ? "red" : "violet"}
          label="Awaiting payment"
          value={fmtGbp(balance.outstanding)}
          state={invoiceState}
          hint={paymentHint}
          to="/portal/invoices"
        />
      </section>

      <section aria-labelledby="moves-heading" className="space-y-3">
        <h2 id="moves-heading" className="sr-only">Your vehicle moves</h2>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedTabs
            label="Vehicle moves"
            className="w-full lg:w-auto"
            value={tab}
            onChange={(t) => setParam("tab", t === "completed" ? "completed" : null, { stage: null })}
            options={[
              { value: "active", label: "In progress", count: isLoading || error ? undefined : active.length },
              { value: "completed", label: "Completed", count: isLoading || error ? undefined : completed.length },
            ]}
          />
          <div className="flex gap-2 lg:w-[26rem]">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                value={search}
                onChange={(e) => setParam("q", e.target.value || null)}
                placeholder="Search reg, ref or town"
                aria-label="Search vehicle moves"
                className="h-11 rounded-xl border-slate-200 bg-white pl-9 pr-9 text-base shadow-none sm:text-sm dark:border-border dark:bg-card"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setParam("q", null)}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  aria-label={filterCount ? `Filters (${filterCount} on)` : "Filters"}
                  className={cn(
                    "relative h-11 w-11 shrink-0 rounded-xl border-slate-200 bg-white p-0 dark:border-border dark:bg-card",
                    filterCount > 0 && "border-[#1E4FA8]/50 text-[#1E4FA8]",
                  )}
                >
                  <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden />
                  {filterCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1E4FA8] px-1 text-[10px] font-semibold text-white">
                      {filterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-4 rounded-xl p-4">
                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Status</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {[null, ...stageOptions].map((s) => (
                      <button
                        key={s ?? "all"}
                        type="button"
                        aria-pressed={activeStage === s}
                        onClick={() => setParam("stage", s)}
                        className={cn(
                          "min-h-8 rounded-lg border px-2.5 text-[13px] font-medium",
                          activeStage === s
                            ? "border-[#1E4FA8] bg-blue-50 text-[#1E4FA8] dark:bg-primary/15 dark:text-primary"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-border dark:text-muted-foreground",
                        )}
                      >
                        {s ? STAGE_LABEL[s] : "All"}
                      </button>
                    ))}
                  </div>
                </fieldset>
                {tab === "completed" && (
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Finished</span>
                    <select
                      aria-label="Date range"
                      value={range}
                      onChange={(e) => setParam("range", e.target.value === "all" ? null : e.target.value)}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      {(Object.keys(RANGE_LABEL) as Range[]).map((r) => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
                    </select>
                  </label>
                )}
                {filterCount > 0 && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => setParam("stage", null, { range: null })}>
                    Clear filters
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {isLoading ? (
          <CardListSkeleton label="Loading your vehicle moves" />
        ) : error ? (
          <ErrorState message="We couldn't load your vehicle moves." onRetry={() => void refetch()} />
        ) : (
          <>
            <div className="flex min-h-8 items-center justify-between gap-3 text-[13px] text-slate-500 dark:text-muted-foreground">
              <p aria-live="polite">
                {plural(list.length, "move")}
                {search || filterCount ? " match" + (list.length === 1 ? "es" : "") : ""}
                {tab === "active" && list.length > 0 && updated ? ` · updated ${updated}` : ""}
              </p>
              <button
                type="button"
                onClick={exportCsv}
                disabled={list.length === 0}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 font-medium text-[#1E4FA8] hover:bg-blue-50 disabled:pointer-events-none disabled:opacity-40 dark:text-primary dark:hover:bg-primary/10"
              >
                <Download className="h-4 w-4" aria-hidden /> Download CSV
              </button>
            </div>

            {list.length === 0 ? (
              search || filterCount ? (
                <EmptyState
                  title={search ? `No moves match “${search}”` : "No moves match these filters"}
                  body="Try a registration, a job reference or a town, or clear the filters."
                  action={
                    <Button variant="outline" size="sm" onClick={() => setParam("q", null, { stage: null, range: null })}>
                      Clear search and filters
                    </Button>
                  }
                />
              ) : tab === "active" ? (
                <EmptyState
                  art={<TransporterArt />}
                  title="No vehicle moves in progress"
                  body="Your active vehicle movements will appear here once a booking is confirmed."
                />
              ) : (
                <EmptyState
                  title="No completed moves yet"
                  body="Delivered vehicles appear here with their condition reports."
                />
              )
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {list.map((j) => (
                  <li key={j.id} className="min-w-0">
                    <MovementCard job={j} back={back} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
