import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Download,
  Loader2,
  Plus,
  Receipt,
  Search,
  Truck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePortalContext, usePortalInvoices, usePortalJobs, type PortalJobSummary } from "../api";
import { STAGE_LABEL, STAGE_NEXT, isActiveStage, portalStage } from "../lib/portalStatus";
import { StageBadge, StageProgress } from "../components/PortalStatus";
import { fmtDate, fmtDay, fmtGbp } from "../lib/format";
import { invoiceBalance } from "../lib/invoiceStatus";
import { downloadCsv, toCsv } from "../lib/csv";
import { usePortalTitle } from "../lib/usePortalTitle";
import { requestMoveMailto } from "../lib/contact";

type Tab = "active" | "completed";
type Range = "30" | "90" | "365" | "all";

const RANGE_LABEL: Record<Range, string> = {
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last 12 months",
  all: "All time",
};

function place(city: string | null, postcode: string | null): string {
  return [city, postcode].filter(Boolean).join(" ") || "—";
}

function vehicleLine(j: PortalJobSummary): string {
  return [j.vehicle_make, j.vehicle_model, j.vehicle_colour].filter(Boolean).join(" · ") || "Vehicle";
}

/** When the move finished (or was booked, if it never completed). */
function finishedAt(j: PortalJobSummary): string {
  return j.completed_at ?? j.created_at;
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  to,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning";
  to?: string;
}) {
  const body = (
    <Card className={cn("h-full", to && "hover:border-primary/40 transition-colors", tone === "warning" && "border-destructive/40")}>
      <CardContent className="p-3 sm:p-4 flex items-start gap-3">
        <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", tone === "warning" ? "text-destructive" : "text-muted-foreground")} />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
          {hint && <p className={cn("text-xs truncate", tone === "warning" ? "text-destructive" : "text-muted-foreground")}>{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link>
  ) : (
    body
  );
}

export default function PortalJobs() {
  const { data: jobs, isLoading, error, dataUpdatedAt } = usePortalJobs();
  const { data: invoices } = usePortalInvoices();
  const { data: ctx } = usePortalContext();
  const [params, setParams] = useSearchParams();

  // Tab, search and date range live in the URL so "Back" from a move returns
  // the client to exactly the list they left.
  const tab: Tab = params.get("tab") === "completed" ? "completed" : "active";
  const search = params.get("q") ?? "";
  const rangeParam = params.get("range");
  const range: Range = rangeParam === "30" || rangeParam === "90" || rangeParam === "365" ? rangeParam : "all";
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  usePortalTitle("Vehicle moves", ctx?.operator.name);

  const { active, completed } = useMemo(() => {
    const a: PortalJobSummary[] = [];
    const c: PortalJobSummary[] = [];
    for (const j of jobs ?? []) (isActiveStage(portalStage(j.status)) ? a : c).push(j);
    // Soonest scheduled first for live moves; most recent first for history.
    a.sort((x, y) => (x.job_date ?? "9999").localeCompare(y.job_date ?? "9999"));
    return { active: a, completed: c };
  }, [jobs]);

  const deliveredThisMonth = useMemo(() => {
    const now = new Date();
    return completed.filter((j) => {
      if (portalStage(j.status) !== "delivered" || !j.completed_at) return false;
      const d = new Date(j.completed_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
  }, [completed]);

  const balance = useMemo(() => invoiceBalance(invoices ?? []), [invoices]);

  const list = useMemo(() => {
    let base = tab === "active" ? active : completed;
    if (tab === "completed" && range !== "all") {
      const cutoff = Date.now() - Number(range) * 86_400_000;
      base = base.filter((j) => new Date(finishedAt(j)).getTime() >= cutoff);
    }
    const s = search.trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return base;
    return base.filter((j) =>
      [j.vehicle_reg, j.job_ref, j.vehicle_make, j.vehicle_model, j.pickup_city, j.delivery_city, j.pickup_postcode, j.delivery_postcode]
        .some((v) => v?.toLowerCase().replace(/\s+/g, "").includes(s)),
    );
  }, [tab, active, completed, search, range]);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return <p className="text-sm text-destructive py-8 text-center">Couldn't load your vehicle moves. Please refresh to try again.</p>;
  }

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

  const tabClass = (t: Tab) =>
    cn(
      "px-3 py-1.5 text-sm rounded-md font-medium",
      tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
    );

  const requestHref = ctx ? requestMoveMailto(ctx) : null;
  const updated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Vehicle moves</h1>
          <p className="text-sm text-muted-foreground">Track every vehicle you've booked with us, from collection to delivery.</p>
        </div>
        {requestHref && (
          <Button asChild size="sm">
            <a href={requestHref}><Plus className="w-4 h-4 mr-1.5" /> Request a move</a>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <StatTile icon={Truck} label="In progress" value={String(active.length)}
          hint={active.length ? "Updates automatically" : "Nothing on the road right now"} />
        <StatTile icon={CheckCircle2} label="Delivered this month" value={String(deliveredThisMonth)}
          hint={`${completed.filter((j) => portalStage(j.status) === "delivered").length} delivered in total`} />
        <StatTile
          icon={balance.overdueCount ? AlertTriangle : Receipt}
          label="Awaiting payment"
          value={fmtGbp(balance.outstanding)}
          tone={balance.overdueCount ? "warning" : "default"}
          hint={
            balance.overdueCount
              ? `${fmtGbp(balance.overdue)} overdue`
              : balance.outstandingCount
                ? balance.nextDue ? `Next due ${fmtDate(balance.nextDue)}` : `${balance.outstandingCount} unpaid`
                : "All paid up"
          }
          to="/portal/invoices"
        />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
        <div className="flex gap-1" role="tablist" aria-label="Vehicle moves">
          <button role="tab" aria-selected={tab === "active"} className={tabClass("active")} onClick={() => setParam("tab", null)}>
            In progress ({active.length})
          </button>
          <button role="tab" aria-selected={tab === "completed"} className={tabClass("completed")} onClick={() => setParam("tab", "completed")}>
            Completed ({completed.length})
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {tab === "completed" && (
            <select
              aria-label="Date range"
              value={range}
              onChange={(e) => setParam("range", e.target.value === "all" ? null : e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {(Object.keys(RANGE_LABEL) as Range[]).map((r) => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
            </select>
          )}
          <div className="relative sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setParam("q", e.target.value || null)}
              placeholder="Search registration, reference or town"
              aria-label="Search vehicle moves"
              className="pl-8"
            />
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={list.length === 0}>
            <Download className="w-4 h-4 mr-1.5" /> Download CSV
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Truck className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">
              {search
                ? "No moves match your search."
                : tab === "active"
                  ? "No vehicle moves in progress."
                  : range !== "all" ? `No completed moves in the ${RANGE_LABEL[range].toLowerCase()}.` : "No completed moves yet."}
            </p>
            {tab === "active" && !search && requestHref && (
              <p className="text-xs text-muted-foreground">
                Need a vehicle moved? <a className="underline" href={requestHref}>Request a move</a>.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {list.map((j) => {
            const stage = portalStage(j.status);
            return (
              <li key={j.id}>
                <Link to={`/portal/jobs/${j.id}`} state={{ back: `/portal${params.toString() ? `?${params}` : ""}` }} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="hover:border-primary/40 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono font-semibold tracking-wide">{j.vehicle_reg}</p>
                          <p className="text-xs text-muted-foreground truncate">{vehicleLine(j)} · Ref {j.job_ref}</p>
                        </div>
                        <StageBadge stage={stage} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm min-w-0">
                        <span className="truncate">{place(j.pickup_city, j.pickup_postcode)}</span>
                        <ArrowRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{place(j.delivery_city, j.delivery_postcode)}</span>
                        {tab === "active" && j.job_date && (
                          <span className="sm:ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="w-3.5 h-3.5" /> Scheduled {fmtDay(j.job_date)}
                          </span>
                        )}
                      </div>
                      {tab === "active" ? (
                        stage === "issue" ? (
                          <p className="text-xs text-destructive">{STAGE_NEXT.issue}</p>
                        ) : (
                          <StageProgress stage={stage} />
                        )
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {stage === "delivered" ? `Delivered ${fmtDate(j.completed_at)} · View condition report` : `Booked ${fmtDate(j.created_at)}`}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "active" && active.length > 0 && updated && (
        <p className="text-xs text-muted-foreground text-center">Last updated {updated} · refreshes every minute</p>
      )}
    </div>
  );
}

