/**
 * DriverJobCard — one job in the driver's list, compact enough that several
 * fit on a phone screen.
 *
 * Layout:
 * 1. Plate · vehicle | status (+ risk chip)
 * 2. Client · job ref
 * 3. Route: collection → delivery (town, postcode, company)
 * 4. When: day, collection window, distance (only when reliable)
 * 5. Workflow blocker / warning / delivery restriction strip
 * 6. Action row: Call + Navigate for the current leg, and the primary CTA
 *
 * Full addresses and both contacts live on the job page (tap the card).
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { AlertTriangle, CalendarDays, ChevronRight, Navigation, Phone } from "lucide-react";
import { getStatusStyle } from "@/lib/statusConfig";
import type { DriverJobSummary } from "@/lib/driverJobSummary";
import { getWorkflowBrain } from "@/lib/workflowBrain";
import { cn } from "@/lib/utils";

interface DriverJobCardProps {
  summary: DriverJobSummary;
  onPrimaryAction: () => void;
  onCardClick: () => void;
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

/** "Today", "Tomorrow", "Yesterday", or "Wed 25 Nov". */
function dayLabel(day: string | null | undefined, today = new Date()): string | null {
  if (!day) return null;
  const d = new Date(`${day.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}

function RouteLine({ kind, place, company }: { kind: "Collect" | "Deliver"; place: string; company: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "h-2.5 w-2.5 shrink-0 rounded-full border-2",
          kind === "Collect" ? "border-primary bg-card" : "border-success bg-success",
        )}
      />
      <p className="min-w-0 truncate text-sm text-foreground">
        <span className="sr-only">{kind === "Collect" ? "Collect from" : "Deliver to"}: </span>
        <span className="font-medium">{place}</span>
        {company && <span className="text-muted-foreground"> · {company}</span>}
      </p>
    </div>
  );
}

export function DriverJobCard({ summary, onPrimaryAction, onCardClick }: DriverJobCardProps) {
  const job = summary._raw;
  const status = getStatusStyle(job.status);

  // ── Workflow brain (additive — never replaces existing CTA logic) ──
  const brain = getWorkflowBrain({ job });
  const brainBlocker = brain.blockers[0] ?? null;
  const brainWarning = brain.warnings[0] ?? null;
  const showRiskChip = brain.riskLevel === "high" || brain.riskLevel === "medium" || !!brainBlocker;
  const deliveryRestriction = summary.constraints.find((c) => c.kind === "do_not_deliver_before");
  const strip = brainBlocker
    ? { text: brainBlocker, tone: "destructive" as const }
    : brainWarning
      ? { text: brainWarning, tone: "warning" as const }
      : null;

  const vehicle = [job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ");
  const pickupPlace = [job.pickup_city, summary.pickup_postcode].filter(Boolean).join(", ") || summary.pickup_address_full;
  const deliveryPlace = [job.delivery_city, summary.delivery_postcode].filter(Boolean).join(", ") || summary.delivery_address_full;
  const window = [hhmm(job.pickup_time_from), hhmm(job.pickup_time_to)].filter(Boolean).join("–");
  const when = [
    dayLabel(job.job_date),
    window || null,
    summary.route_metrics_reliable && summary.route_distance_miles != null ? `${Math.round(summary.route_distance_miles)} mi` : null,
  ].filter(Boolean);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Card
      className="cursor-pointer overflow-hidden rounded-2xl border border-border p-0 transition-colors active:bg-muted/50"
      onClick={onCardClick}
    >
      <div className="space-y-2.5 p-3">
        {/* Plate · vehicle | status */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* the plate is the vehicle's identity: never let other text squeeze it */}
            <div className="shrink-0">
              <UKPlate size="compact" reg={summary.vehicle_reg} />
            </div>
            {vehicle && <p className="min-w-0 truncate text-[13px] font-medium text-foreground/80">{vehicle}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              style={{ backgroundColor: status.backgroundColor, color: status.color }}
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase leading-none tracking-wide"
            >
              {status.label}
            </span>
            {showRiskChip && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide",
                  brain.riskLevel === "high" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning",
                )}
                aria-label={`Risk ${brain.riskLevel}`}
              >
                {brain.riskLevel === "high" ? "Action needed" : "Heads up"}
              </span>
            )}
          </div>
        </div>

        {/* Client · ref | when */}
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <p className="min-w-0 truncate" title={`${summary.client_name} · ${summary.job_ref}`}>
            <span className="font-medium text-foreground">{summary.client_name}</span> · <span className="tabular-nums">{summary.job_ref}</span>
          </p>
          {when.length > 0 && (
            <p className="flex shrink-0 items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              {when.join(" · ")}
            </p>
          )}
        </div>

        {/* Route */}
        <div className="space-y-1.5 rounded-xl bg-muted/50 px-3 py-2">
          <RouteLine kind="Collect" place={pickupPlace} company={summary.pickup_company} />
          <RouteLine kind="Deliver" place={deliveryPlace} company={summary.delivery_company} />
        </div>

        {strip && (
          <p
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
              strip.tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{strip.text}</span>
          </p>
        )}
        {deliveryRestriction && (
          <p className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{deliveryRestriction.label}</span>
          </p>
        )}

        {/* Actions: the current leg's contact and destination, then the next step */}
        <div className="flex items-center gap-2 pt-0.5">
          {summary.current_contact_phone ? (
            <Button
              asChild
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl"
            >
              <a
                href={`tel:${summary.current_contact_phone}`}
                onClick={stop}
                aria-label={`Call ${summary.current_contact_name || "contact"}`}
              >
                <Phone className="h-[18px] w-[18px]" aria-hidden />
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl" disabled aria-label="No phone number">
              <Phone className="h-[18px] w-[18px]" aria-hidden />
            </Button>
          )}
          <Button asChild variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-xl">
            <a href={mapsUrl(summary.nav_address)} target="_blank" rel="noopener noreferrer" onClick={stop} aria-label="Navigate">
              <Navigation className="h-[18px] w-[18px]" aria-hidden />
            </a>
          </Button>
          <Button
            onClick={(e) => { e.stopPropagation(); onPrimaryAction(); }}
            className="h-11 min-w-0 flex-1 rounded-xl text-sm font-semibold"
          >
            <span className="truncate">{summary.primary_cta.label}</span>
            <ChevronRight className="ml-1 h-4 w-4 shrink-0" aria-hidden />
          </Button>
        </div>
      </div>
    </Card>
  );
}
