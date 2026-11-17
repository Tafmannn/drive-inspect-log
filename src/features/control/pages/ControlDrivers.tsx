/**
 * Drivers — /control/drivers
 * The one driver roster for admins and the owner, on every screen size.
 * Merges the old mobile page (/admin/drivers: onboarding completion,
 * 60-day performance and risk) with the desktop table (workload, stale and
 * name-match cues, licence and plate monitoring, call and jobs actions).
 * Cards below 1024px, a table above; filter and search live in the URL.
 */
import { useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { ViewChips } from "../components/shared/ViewChips";
import type { CompactColumn } from "../components/shared/CompactTable";
import { ResponsiveList } from "../components/shared/ResponsiveList";
import { StatusChip } from "../components/shared/StatusChip";
import { UKPlate } from "@/components/UKPlate";
import {
  useControlDrivers,
  useDriversKpis,
  isLicenceExpiringSoon,
  type DriverControlRow,
  resolveDriverFilter,
  type DriverFilter,
} from "../hooks/useControlDriversData";
import { getStatusStyle } from "@/lib/statusConfig";
import { useDriverPerformance } from "@/hooks/useDriverPerformance";
import { scoreDriver, type CompletionResult } from "@/features/onboarding/lib/completion";
import { CompletionBadge } from "@/features/onboarding/components/CompletionBadge";
import { DriverCard, PerformanceCell } from "./drivers/DriverCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Users, CheckCircle, AlertTriangle, Phone,
  Truck, ShieldAlert, Clock,
} from "lucide-react";

function completionFor(r: DriverControlRow): CompletionResult {
  return scoreDriver({
    full_name: r.full_name,
    phone: r.phone,
    licence_number: r.licence_number,
    licence_expiry: r.licence_expiry,
    right_to_work: r.right_to_work,
    home_postcode: r.home_postcode,
    payout_terms: r.payout_terms,
    bank_captured: !!r.bank_captured,
    trade_plate_number: r.trade_plate_number,
  });
}

const FILTER_OPTIONS: { value: DriverFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "with-workload", label: "With Jobs" },
  { value: "no-workload", label: "No Linked Jobs" },
  { value: "licence-expiring", label: "Licence Expiring" },
  { value: "missing-plate", label: "No Trade Plate" },
];

export function ControlDrivers() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const filter = resolveDriverFilter(searchParams.get("filter"));
  const writeParams = useCallback(
    (f: DriverFilter, term: string, replace = false) => {
      const p = new URLSearchParams();
      if (f !== "all") p.set("filter", f);
      if (term.trim()) p.set("search", term);
      setSearchParams(p, { replace });
    },
    [setSearchParams],
  );
  const setFilter = (f: DriverFilter) => writeParams(f, search);
  const setSearch = (term: string) => writeParams(filter, term, true);

  const { data: drivers, isLoading, error, refetch } = useControlDrivers(search, filter);
  const { data: kpis, isLoading: kpisLoading } = useDriversKpis();
  const userIds = useMemo(() => (drivers ?? []).map((d) => d.user_id).filter(Boolean), [drivers]);
  const { data: perfMap } = useDriverPerformance(userIds);
  const completions = useMemo(() => {
    const m = new Map<string, CompletionResult>();
    for (const d of drivers ?? []) m.set(d.id, completionFor(d));
    return m;
  }, [drivers]);

  const openProfile = (r: DriverControlRow) =>
    navigate(`/admin/drivers/${r.user_id}?from=${encodeURIComponent("/control/drivers")}`);
  const openJobs = (r: DriverControlRow) =>
    navigate(`/control/jobs?view=all&search=${encodeURIComponent(r.display_name || r.full_name)}`);

  const kpiItems = [
    { label: "Total Drivers", value: kpis?.total, icon: Users, variant: "default" as const, loading: kpisLoading, onClick: () => setFilter("all") },
    { label: "Active", value: kpis?.active, icon: CheckCircle, variant: "success" as const, loading: kpisLoading, onClick: () => setFilter("active") },
    { label: "Licence Expiring (30d)", value: kpis?.licenceExpiring, icon: AlertTriangle, variant: kpis?.licenceExpiring ? "warning" as const : "default" as const, loading: kpisLoading, onClick: () => setFilter("licence-expiring") },
    { label: "Missing Trade Plate", value: kpis?.missingPlate, icon: ShieldAlert, variant: kpis?.missingPlate ? "warning" as const : "default" as const, loading: kpisLoading, onClick: () => setFilter("missing-plate") },
  ];

  const columns: CompactColumn<DriverControlRow>[] = [
    // ── IDENTITY BAND ──
    {
      key: "name",
      header: "Driver",
      className: "min-w-[150px]",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-foreground">{r.display_name || r.full_name}</span>
          {r.display_name && r.full_name && r.display_name !== r.full_name && (
            <span className="text-[10px] text-muted-foreground">{r.full_name}</span>
          )}
          <div className="flex items-center gap-1.5">
            <StatusChip
              label={r.is_active ? "Active" : "Inactive"}
              variant={r.is_active ? "success" : "muted"}
              className="text-[9px] px-1.5 py-0"
            />
            {r.employment_type && (
              <span className="text-[10px] text-muted-foreground capitalize">{r.employment_type.replace(/_/g, " ")}</span>
            )}
          </div>
        </div>
      ),
    },
    // ── WORKLOAD BAND ──
    {
      key: "workload",
      header: "Workload",
      className: "min-w-[160px]",
      render: (r) => {
        if (r.activeJobCount === 0) {
          return (
            <span className="text-[11px] text-muted-foreground">No linked jobs</span>
          );
        }
        const statusStyle = r.latestJobStatus ? getStatusStyle(r.latestJobStatus) : null;
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Badge variant={r.activeJobCount >= 3 ? "destructive" : "default"} className="text-[10px] tabular-nums">
                {r.activeJobCount} job{r.activeJobCount !== 1 ? "s" : ""}
              </Badge>
              {r.hasStaleJob && (
                <span className="inline-flex items-center gap-0.5 text-[9px] text-warning font-medium">
                  <Clock className="h-2.5 w-2.5" /> Stale
                </span>
              )}
              {r.workloadLinkType === "name" && (
                <span className="text-[9px] text-muted-foreground italic" title="Linked via driver name (legacy). FK link preferred.">
                  name match
                </span>
              )}
            </div>
            {r.latestJobReg && (
              <div className="flex items-center gap-1.5">
                <UKPlate reg={r.latestJobReg} />
                {statusStyle && (
                  <span
                    className="text-[9px] font-medium px-1.5 py-0 rounded"
                    style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
                  >
                    {statusStyle.label}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    // ── ONBOARDING + PERFORMANCE BAND ──
    {
      key: "profile",
      header: "Profile",
      className: "w-[110px]",
      render: (r) => {
        const c = completions.get(r.id);
        return c ? <CompletionBadge result={c} /> : null;
      },
    },
    {
      key: "performance",
      header: "Last 60 days",
      className: "w-[150px]",
      render: (r) => <PerformanceCell perf={perfMap?.[r.user_id]} />,
    },
    // ── SECONDARY RISK / ADMIN BAND ──
    {
      key: "contact",
      header: "Phone",
      className: "w-[120px]",
      render: (r) =>
        r.phone ? (
          <a
            href={`tel:${r.phone}`}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="h-3 w-3" /> {r.phone}
          </a>
        ) : (
          <span className="text-[10px] text-warning/70">No phone</span>
        ),
    },
    {
      key: "plate",
      header: "Trade Plate",
      className: "w-[100px]",
      render: (r) =>
        r.trade_plate_number ? (
          <span className="text-xs font-mono text-muted-foreground">{r.trade_plate_number}</span>
        ) : (
          <span className="text-[10px] text-warning/70">Missing</span>
        ),
    },
    {
      key: "licence",
      header: "Licence Expiry",
      className: "w-[110px]",
      render: (r) => {
        if (!r.licence_expiry) return <span className="text-[10px] text-muted-foreground">Not set</span>;
        const expiring = isLicenceExpiringSoon(r.licence_expiry);
        return (
          <span className={`text-xs ${expiring ? "text-warning font-medium" : "text-muted-foreground"}`}>
            {new Date(r.licence_expiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
            {expiring && <AlertTriangle className="inline h-3 w-3 ml-1 text-warning" />}
          </span>
        );
      },
    },
    // ── ACTION BAND ──
    {
      key: "actions",
      header: "",
      className: "w-[90px] text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          {r.phone && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={(e) => { e.stopPropagation(); window.open(`tel:${r.phone}`); }}
              title="Call driver"
            >
              <Phone className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={(e) => { e.stopPropagation(); openJobs(r); }}
            title="View driver's jobs"
          >
            <Truck className="h-3 w-3 mr-0.5" /> Jobs
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Drivers"
        subtitle="Roster, workload, onboarding, performance and licence monitoring"
      />

      <KpiStrip items={kpiItems} className="grid-cols-2 lg:grid-cols-4" />

      <div className="rounded-lg border bg-card px-3 py-2.5 space-y-2 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-2">
        <div className="relative lg:flex-1 lg:min-w-[200px] lg:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 lg:h-3.5 lg:w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, plate, licence…"
            className="pl-9 lg:pl-8 h-11 lg:h-8 text-sm lg:text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search drivers"
          />
        </div>
        <ViewChips options={FILTER_OPTIONS} value={filter} onChange={setFilter} ariaLabel="Driver filters" />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center justify-between gap-2">
          <p className="text-xs text-destructive">Failed to load drivers: {error instanceof Error ? error.message : "Unknown error"}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button>
        </div>
      )}

      {/* Drivers Table */}
      <ControlSection
        title="Driver Roster"
        description={`${drivers?.length ?? 0} driver${(drivers?.length ?? 0) !== 1 ? "s" : ""} matching current filters`}
        flush
      >
        <ResponsiveList<DriverControlRow>
          rows={drivers ?? []}
          columns={columns}
          loading={isLoading}
          cardListClassName="lg:grid-cols-2"
          renderCard={(r) => (
            <DriverCard
              driver={r}
              perf={perfMap?.[r.user_id]}
              completion={completions.get(r.id) ?? completionFor(r)}
              onOpen={() => openProfile(r)}
              onJobs={() => openJobs(r)}
            />
          )}
          emptyMessage={
            filter !== "all"
              ? `No drivers match the "${FILTER_OPTIONS.find((o) => o.value === filter)?.label}" filter.`
              : search.trim()
                ? "No drivers match your search."
                : "No drivers found."
          }
          onRowClick={openProfile}
        />
      </ControlSection>
    </ControlShell>
  );
}
