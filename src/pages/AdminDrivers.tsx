/**
 * Phase 6 — Admin Drivers
 * Workload visibility: name, status, active jobs, latest job, risk flags.
 * Mobile-first card layout with filters.
 */

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { useAdminDrivers, type AdminDriverRow, type DriverFilter } from "@/hooks/useAdminDrivers";
import { useDriverPerformance } from "@/hooks/useDriverPerformance";
import type { DriverPerformance } from "@/lib/driverPerformance";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getStatusStyle } from "@/lib/statusConfig";
import {
  AlertTriangle, Phone, Truck, User, ShieldAlert, CreditCard,
  Activity, CheckCircle2, AlertOctagon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Filter pills ──────────────────────────────────────────────── */

const FILTERS: { key: DriverFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "with-jobs", label: "With Jobs" },
  { key: "no-jobs", label: "No Jobs" },
  { key: "licence-expiring", label: "Licence Expiring" },
  { key: "missing-plate", label: "Missing Plate" },
];

function filterDrivers(drivers: AdminDriverRow[], filter: DriverFilter): AdminDriverRow[] {
  switch (filter) {
    case "active": return drivers.filter(d => d.isActive);
    case "with-jobs": return drivers.filter(d => d.activeJobCount > 0);
    case "no-jobs": return drivers.filter(d => d.activeJobCount === 0);
    case "licence-expiring": return drivers.filter(d => d.licenceExpiring);
    case "missing-plate": return drivers.filter(d => d.missingPlate);
    default: return drivers;
  }
}

/* ─── Driver Card ───────────────────────────────────────────────── */

function PerformanceStrip({ perf }: { perf: DriverPerformance | undefined }) {
  if (!perf || perf.totalJobs === 0) return null;
  const riskTone =
    perf.riskLevel === "high"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : perf.riskLevel === "medium"
        ? "border-warning/40 bg-warning/5 text-warning"
        : "border-success/30 bg-success/5 text-success";
  const RiskIcon = perf.riskLevel === "high" ? AlertOctagon : perf.riskLevel === "medium" ? AlertTriangle : CheckCircle2;
  const completionPct = Math.round(perf.completionRate * 100);

  return (
    <div className="space-y-2 pt-2 border-t border-border/60">
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <div className="font-semibold tabular-nums text-foreground">{perf.completedJobs}</div>
          <div className="text-muted-foreground">Completed</div>
        </div>
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <div className="font-semibold tabular-nums text-foreground">{completionPct}%</div>
          <div className="text-muted-foreground">Completion</div>
        </div>
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <div className={cn("font-semibold tabular-nums", perf.podRejectionCount > 0 ? "text-destructive" : "text-foreground")}>
            {perf.podRejectionCount}
          </div>
          <div className="text-muted-foreground">POD issues</div>
        </div>
      </div>
      <div className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium", riskTone)}>
        <RiskIcon className="h-3 w-3" />
        <span className="capitalize">{perf.riskLevel} risk</span>
        {perf.riskReasons.length > 0 && (
          <span className="text-muted-foreground font-normal truncate">
            · {perf.riskReasons.slice(0, 2).join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

function DriverCard({ driver, perf }: { driver: AdminDriverRow; perf?: DriverPerformance }) {
  const hasRisk = driver.licenceExpiring || driver.missingPlate;
  const statusStyle = driver.latestJobStatus ? getStatusStyle(driver.latestJobStatus) : null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-foreground truncate">
              {driver.displayName || driver.fullName}
            </p>
            {driver.phone && (
              <a href={`tel:${driver.phone}`} className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" /> {driver.phone}
              </a>
            )}
          </div>
        </div>
        <Badge variant={driver.isActive ? "default" : "secondary"} className="shrink-0 text-[11px]">
          {driver.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      {/* Workload row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Truck className="h-3.5 w-3.5" />
          <span className="font-medium tabular-nums">{driver.activeJobCount}</span>
          <span>active job{driver.activeJobCount !== 1 ? "s" : ""}</span>
        </div>
        {driver.latestJobReg && statusStyle && (
          <div className="flex items-center gap-2">
            <UKPlate reg={driver.latestJobReg} />
            <span
              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none"
            >
              {statusStyle.label}
            </span>
          </div>
        )}
      </div>

      {/* Risk flags */}
      {hasRisk && (
        <div className="flex flex-wrap gap-2">
          {driver.licenceExpiring && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-warning bg-warning/10 rounded-md px-2 py-1">
              <ShieldAlert className="h-3 w-3" />
              Licence {driver.licenceExpiry
                ? `expires ${new Date(driver.licenceExpiry).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                : "expiring soon"}
            </div>
          )}
          {driver.missingPlate && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-destructive bg-destructive/10 rounded-md px-2 py-1">
              <CreditCard className="h-3 w-3" />
              Missing trade plate
            </div>
          )}
        </div>
      )}

      {/* Performance strip (admin-only via parent gate) */}
      <PerformanceStrip perf={perf} />
    </div>
  );
}

/* ─── KPI strip ─────────────────────────────────────────────────── */

function DriverKpis({ drivers }: { drivers: AdminDriverRow[] }) {
  const active = drivers.filter(d => d.isActive).length;
  const withJobs = drivers.filter(d => d.activeJobCount > 0).length;
  const risked = drivers.filter(d => d.licenceExpiring || d.missingPlate).length;

  const pills = [
    { label: "Total", value: drivers.length },
    { label: "Active", value: active },
    { label: "With Jobs", value: withJobs },
    { label: "Risk Flags", value: risked, warn: risked > 0 },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {pills.map(p => (
        <div
          key={p.label}
          className={cn(
            "flex flex-col items-center rounded-xl border p-2.5",
            p.warn ? "border-warning/30 bg-warning/5" : "border-border bg-card",
          )}
        >
          <span className={cn("text-lg font-semibold tabular-nums", p.warn ? "text-warning" : "text-foreground")}>
            {p.value}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────── */

export function AdminDrivers() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: drivers, isLoading } = useAdminDrivers();
  const driverUserIds = (drivers ?? []).map(d => d.userId).filter(Boolean);
  const { data: perfMap } = useDriverPerformance(driverUserIds);
  const [filter, setFilter] = useState<DriverFilter>("all");

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <AppHeader title="Access Denied" showBack onBack={() => navigate("/admin")} />
        <p className="text-center py-12 text-sm text-muted-foreground">You do not have permission.</p>
        <BottomNav />
      </div>
    );
  }

  const filtered = filterDrivers(drivers ?? [], filter);

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Drivers" showBack onBack={() => navigate("/admin")} />

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* KPIs */}
            <DriverKpis drivers={drivers ?? []} />

            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
              {FILTERS.map(f => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={filter === f.key ? "default" : "outline"}
                  onClick={() => setFilter(f.key)}
                  className="shrink-0 h-8 text-xs rounded-full"
                >
                  {f.label}
                  {f.key !== "all" && (
                    <span className="ml-1 tabular-nums opacity-70">
                      {filterDrivers(drivers ?? [], f.key).length}
                    </span>
                  )}
                </Button>
              ))}
            </div>

            {/* Driver list */}
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">No drivers match this filter.</p>
            ) : (
              <div className="space-y-3">
                {filtered.map(d => <DriverCard key={d.id} driver={d} />)}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
