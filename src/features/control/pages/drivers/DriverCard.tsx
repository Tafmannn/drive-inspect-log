/**
 * Driver card (phones and tablets) and the performance pieces shared with the
 * desktop table: onboarding completion, 60-day performance and risk.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { getStatusStyle } from "@/lib/statusConfig";
import type { DriverPerformance } from "@/lib/driverPerformance";
import { CompletionBadge } from "@/features/onboarding/components/CompletionBadge";
import type { CompletionResult } from "@/features/onboarding/lib/completion";
import { isLicenceExpiringSoon, type DriverControlRow } from "../../hooks/useControlDriversData";
import { cn } from "@/lib/utils";
import {
  AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight, Clock, CreditCard, Phone, ShieldAlert, Truck, User,
} from "lucide-react";

export function PerformanceStrip({ perf }: { perf: DriverPerformance | undefined }) {
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
          <span className="text-muted-foreground font-normal truncate">· {perf.riskReasons.slice(0, 2).join(", ")}</span>
        )}
      </div>
    </div>
  );
}

/** Compact performance cell for the desktop table. */
export function PerformanceCell({ perf }: { perf: DriverPerformance | undefined }) {
  if (!perf || perf.totalJobs === 0) return <span className="text-[10px] text-muted-foreground">No recent jobs</span>;
  const tone =
    perf.riskLevel === "high" ? "text-destructive" : perf.riskLevel === "medium" ? "text-warning" : "text-success";
  return (
    <div className="flex flex-col gap-0.5" title={perf.riskReasons.join(", ") || undefined}>
      <span className="text-xs tabular-nums text-foreground">
        {perf.completedJobs} done · {Math.round(perf.completionRate * 100)}%
        {perf.podRejectionCount > 0 && <span className="text-destructive"> · {perf.podRejectionCount} POD</span>}
      </span>
      <span className={cn("text-[10px] font-medium capitalize", tone)}>{perf.riskLevel} risk</span>
    </div>
  );
}

export function DriverCard({
  driver,
  perf,
  completion,
  onOpen,
  onJobs,
}: {
  driver: DriverControlRow;
  perf?: DriverPerformance;
  completion: CompletionResult;
  onOpen: () => void;
  onJobs: () => void;
}) {
  const licenceExpiring = isLicenceExpiringSoon(driver.licence_expiry);
  const statusStyle = driver.latestJobStatus ? getStatusStyle(driver.latestJobStatus) : null;
  const name = driver.display_name || driver.full_name;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="w-full text-left rounded-xl border bg-card p-4 space-y-3 transition-colors hover:bg-muted/30 active:bg-muted/40 cursor-pointer"
      aria-label={`Open ${name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-medium text-foreground truncate">{name}</p>
            {driver.employment_type && (
              <span className="text-xs text-muted-foreground capitalize">{driver.employment_type.replace(/_/g, " ")}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <CompletionBadge result={completion} />
          <Badge variant={driver.is_active ? "default" : "secondary"} className="text-[11px]">
            {driver.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Truck className="h-3.5 w-3.5" />
          <span className="font-medium tabular-nums">{driver.activeJobCount}</span>
          <span>open job{driver.activeJobCount !== 1 ? "s" : ""}</span>
          {driver.hasStaleJob && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-warning font-medium">
              <Clock className="h-3 w-3" /> Stale
            </span>
          )}
        </div>
        {driver.latestJobReg && statusStyle && (
          <div className="flex items-center gap-2">
            <UKPlate size="compact" reg={driver.latestJobReg} />
            <span
              style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none"
            >
              {statusStyle.label}
            </span>
          </div>
        )}
      </div>

      {(licenceExpiring || driver.missingTradePlate) && (
        <div className="flex flex-wrap gap-2">
          {licenceExpiring && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-warning bg-warning/10 rounded-md px-2 py-1">
              <ShieldAlert className="h-3 w-3" />
              Licence{" "}
              {driver.licence_expiry
                ? `expires ${new Date(driver.licence_expiry).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}`
                : "expiring soon"}
            </div>
          )}
          {driver.missingTradePlate && (
            <div className="flex items-center gap-1 text-[11px] font-medium text-destructive bg-destructive/10 rounded-md px-2 py-1">
              <CreditCard className="h-3 w-3" />
              Missing trade plate
            </div>
          )}
        </div>
      )}

      <PerformanceStrip perf={perf} />

      <div className="flex items-center gap-2 pt-1">
        {driver.phone ? (
          <Button asChild variant="outline" size="sm" className="min-h-[40px] text-xs">
            <a href={`tel:${driver.phone}`} onClick={(e) => e.stopPropagation()} aria-label={`Call ${name}`}>
              <Phone className="h-3.5 w-3.5 mr-1" /> Call
            </a>
          </Button>
        ) : (
          <span className="text-[11px] text-warning">No phone</span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[40px] text-xs"
          onClick={(e) => { e.stopPropagation(); onJobs(); }}
        >
          <Truck className="h-3.5 w-3.5 mr-1" /> Jobs
        </Button>
        <span className="ml-auto inline-flex items-center text-[11px] font-medium text-muted-foreground">
          Profile <ChevronRight className="h-3 w-3 ml-0.5" />
        </span>
      </div>
    </div>
  );
}
