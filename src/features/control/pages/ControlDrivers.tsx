/**
 * Drivers Control Page — /control/drivers
 * Assignment and workload visibility using real driver_profiles + derived job counts.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { StatusChip } from "../components/shared/StatusChip";
import { FilterBar } from "../components/shared/FilterBar";
import { UKPlate } from "@/components/UKPlate";
import { useControlDrivers, useDriversKpis, type DriverControlRow } from "../hooks/useControlDriversData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Users, CheckCircle, AlertTriangle, Phone,
  Eye, Truck,
} from "lucide-react";

function isExpiringSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getTime() < Date.now() + 30 * 86400_000;
}

export function ControlDrivers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data: drivers, isLoading } = useControlDrivers(search);
  const { data: kpis, isLoading: kpisLoading } = useDriversKpis();

  const kpiItems = [
    { label: "Total Drivers", value: kpis?.total, icon: Users, variant: "default" as const, loading: kpisLoading },
    { label: "Active", value: kpis?.active, icon: CheckCircle, variant: "success" as const, loading: kpisLoading },
    { label: "Licence Expiring (30d)", value: kpis?.licenceExpiring, icon: AlertTriangle, variant: kpis?.licenceExpiring ? "warning" as const : "default" as const, loading: kpisLoading },
  ];

  const columns: CompactColumn<DriverControlRow>[] = [
    {
      key: "name",
      header: "Driver",
      className: "min-w-[140px]",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-foreground">{r.display_name || r.full_name}</span>
          {r.employment_type && (
            <span className="text-[10px] text-muted-foreground capitalize">{r.employment_type}</span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-[90px]",
      render: (r) => (
        <StatusChip
          label={r.is_active ? "Active" : "Inactive"}
          variant={r.is_active ? "success" : "muted"}
        />
      ),
    },
    {
      key: "phone",
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
          <span className="text-[11px] text-muted-foreground">—</span>
        ),
    },
    {
      key: "workload",
      header: "Active Jobs",
      className: "w-[90px] text-center",
      render: (r) => (
        <Badge variant={r.activeJobCount > 0 ? "default" : "secondary"} className="text-[10px]">
          {r.activeJobCount}
        </Badge>
      ),
    },
    {
      key: "latestJob",
      header: "Latest Vehicle",
      className: "w-[110px]",
      render: (r) =>
        r.latestJobReg ? <UKPlate reg={r.latestJobReg} /> : <span className="text-[11px] text-muted-foreground">—</span>,
    },
    {
      key: "plate",
      header: "Trade Plate",
      className: "w-[100px]",
      render: (r) => (
        <span className="text-xs font-mono text-muted-foreground">{r.trade_plate_number || "—"}</span>
      ),
    },
    {
      key: "licence",
      header: "Licence Expiry",
      className: "w-[110px]",
      render: (r) => {
        if (!r.licence_expiry) return <span className="text-[11px] text-muted-foreground">—</span>;
        const expiring = isExpiringSoon(r.licence_expiry);
        return (
          <span className={`text-xs ${expiring ? "text-warning font-medium" : "text-muted-foreground"}`}>
            {new Date(r.licence_expiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
            {expiring && <AlertTriangle className="inline h-3 w-3 ml-1 text-warning" />}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      className: "w-[100px] text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          {r.phone && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={(e) => { e.stopPropagation(); window.open(`tel:${r.phone}`); }}
            >
              <Phone className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={(e) => { e.stopPropagation(); navigate(`/jobs?driver=${encodeURIComponent(r.display_name || r.full_name)}`); }}
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
        subtitle="Fleet roster, assignment workload, and licence monitoring"
      />

      {/* KPI Strip */}
      <KpiStrip items={kpiItems} className="grid-cols-3" />

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
      </FilterBar>

      {/* Drivers Table */}
      <ControlSection
        title="Driver Roster"
        description={`${drivers?.length ?? 0} drivers in your organisation`}
        flush
      >
        <CompactTable
          columns={columns}
          data={drivers ?? []}
          loading={isLoading}
          emptyMessage="No drivers found."
        />
      </ControlSection>
    </ControlShell>
  );
}
