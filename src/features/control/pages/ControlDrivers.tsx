/**
 * Drivers Control Page — /control/drivers
 * Dispatch-support workload surface: identity, workload, risk cues, actions.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { StatusChip } from "../components/shared/StatusChip";
import { FilterBar } from "../components/shared/FilterBar";
import { UKPlate } from "@/components/UKPlate";
import {
  useControlDrivers,
  useDriversKpis,
  isLicenceExpiringSoon,
  type DriverControlRow,
  type DriverFilter,
} from "../hooks/useControlDriversData";
import { getStatusStyle } from "@/lib/statusConfig";
import { humanAge } from "../pages/jobs/jobsUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Users, CheckCircle, AlertTriangle, Phone,
  Truck, ShieldAlert, Clock,
} from "lucide-react";

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
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DriverFilter>("all");
  const { data: drivers, isLoading, error } = useControlDrivers(search, filter);
  const { data: kpis, isLoading: kpisLoading } = useDriversKpis();

  const kpiItems = [
    { label: "Total Drivers", value: kpis?.total, icon: Users, variant: "default" as const, loading: kpisLoading },
    { label: "Active", value: kpis?.active, icon: CheckCircle, variant: "success" as const, loading: kpisLoading },
    { label: "Licence Expiring (30d)", value: kpis?.licenceExpiring, icon: AlertTriangle, variant: kpis?.licenceExpiring ? "warning" as const : "default" as const, loading: kpisLoading },
    { label: "Missing Trade Plate", value: kpis?.missingPlate, icon: ShieldAlert, variant: kpis?.missingPlate ? "warning" as const : "default" as const, loading: kpisLoading },
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
          <div className="flex items-center gap-1.5">
            <StatusChip
              label={r.is_active ? "Active" : "Inactive"}
              variant={r.is_active ? "success" : "muted"}
              className="text-[9px] px-1.5 py-0"
            />
            {r.employment_type && (
              <span className="text-[10px] text-muted-foreground capitalize">{r.employment_type}</span>
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
            onClick={(e) => { e.stopPropagation(); navigate(`/control/jobs?search=${encodeURIComponent(r.display_name || r.full_name)}`); }}
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
        subtitle="Fleet roster, workload visibility, and licence monitoring"
      />

      {/* KPI Strip */}
      <KpiStrip items={kpiItems} className="grid-cols-4" />

      {/* Filter Bar */}
      <FilterBar>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search driver name, phone, plate…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={filter === opt.value ? "default" : "outline"}
              size="sm"
              className="h-7 text-[10px] px-2.5"
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </FilterBar>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-4">
          <p className="text-xs text-destructive">Failed to load drivers: {error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      )}

      {/* Drivers Table */}
      <ControlSection
        title="Driver Roster"
        description={`${drivers?.length ?? 0} driver${(drivers?.length ?? 0) !== 1 ? "s" : ""} matching current filters`}
        flush
      >
        <CompactTable
          columns={columns}
          data={drivers ?? []}
          loading={isLoading}
          emptyMessage={
            filter !== "all"
              ? `No drivers match the "${FILTER_OPTIONS.find((o) => o.value === filter)?.label}" filter.`
              : search.trim()
                ? "No drivers match your search."
                : "No drivers found."
          }
        />
      </ControlSection>
    </ControlShell>
  );
}
