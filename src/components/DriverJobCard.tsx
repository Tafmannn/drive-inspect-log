/**
 * DriverJobCard — Decision-optimized card for the My Jobs launcher.
 *
 * 7-row layout:
 * 1. Workflow badge · Job ref · Reg plate
 * 2. Pickup postcode → Delivery postcode
 * 3. Pickup company / Delivery company
 * 4. Constraints (time windows, restrictions)
 * 5. Route economics (miles, ETA) — only if reliable
 * 6. Priority/recommendation row with reason
 * 7. Primary CTA + Call + Maps
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import {
  Phone,
  Navigation,
  ChevronRight,
  AlertTriangle,
  Sparkles,
  Clock,
  Lock,
  Route,
  Timer,
} from "lucide-react";
import type { DriverJobSummary, PriorityState, WorkflowState } from "@/lib/driverJobSummary";

interface DriverJobCardProps {
  summary: DriverJobSummary;
  onPrimaryAction: () => void;
  onCardClick: () => void;
}

// ── Workflow badge styling ───────────────────────────────────────────

const WORKFLOW_BADGE: Record<WorkflowState, { label: string; bg: string; fg: string }> = {
  awaiting_pickup:  { label: "AWAITING PICKUP",  bg: "hsl(var(--primary))",     fg: "#fff" },
  pickup_active:    { label: "PICKUP ACTIVE",    bg: "hsl(30 100% 50%)",       fg: "#fff" },
  in_transit:       { label: "IN TRANSIT",       bg: "hsl(30 100% 50%)",       fg: "#fff" },
  awaiting_delivery:{ label: "AWAITING DELIVERY",bg: "hsl(var(--primary))",     fg: "#fff" },
  delivery_active:  { label: "DELIVERY ACTIVE",  bg: "hsl(30 100% 50%)",       fg: "#fff" },
  pending_review:   { label: "PENDING REVIEW",   bg: "hsl(258 56% 59%)",       fg: "#fff" },
  terminal:         { label: "COMPLETE",          bg: "hsl(var(--muted))",      fg: "hsl(var(--muted-foreground))" },
};

// ── Priority row styling ────────────────────────────────────────────

function priorityRow(state: PriorityState, reason: string | null) {
  if (!reason) return null;

  const configs: Record<PriorityState, { icon: typeof Sparkles; className: string; prefix: string } | null> = {
    recommended_now: { icon: Sparkles, className: "text-primary bg-primary/10", prefix: "Recommended" },
    due_soon:        { icon: Clock,    className: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950", prefix: "Due soon" },
    blocked:         { icon: Lock,     className: "text-destructive bg-destructive/10", prefix: "Blocked" },
    late_risk:       { icon: AlertTriangle, className: "text-destructive bg-destructive/10", prefix: "Late risk" },
    normal:          null,
  };

  const cfg = configs[state];
  if (!cfg) return null;

  const Icon = cfg.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium ${cfg.className}`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span>{cfg.prefix}: {reason}</span>
    </div>
  );
}

// ── CTA variant ─────────────────────────────────────────────────────

function ctaVariant(state: PriorityState): "default" | "outline" | "destructive" {
  if (state === "blocked") return "outline";
  if (state === "late_risk") return "destructive";
  return "default";
}

function mapsNavUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

// ── Component ───────────────────────────────────────────────────────

export function DriverJobCard({ summary, onPrimaryAction, onCardClick }: DriverJobCardProps) {
  const badge = WORKFLOW_BADGE[summary.workflow_state];

  return (
    <Card
      className="p-0 mb-2 border border-border overflow-hidden cursor-pointer active:bg-muted/50 transition-colors"
      onClick={onCardClick}
    >
      {/* ── ROW 1: Workflow badge · Job ref · Reg plate ── */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{ backgroundColor: badge.bg, color: badge.fg }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none shrink-0 tracking-wide"
          >
            {badge.label}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground truncate">
            {summary.job_ref}
          </span>
        </div>
        <UKPlate reg={summary.vehicle_reg} />
      </div>

      {/* ── ROW 2: Postcodes ── */}
      <div className="px-3 pb-0.5">
        <span className="text-[12px] font-mono font-semibold text-foreground tracking-wide">
          {summary.pickup_postcode}
          <span className="text-muted-foreground font-normal mx-1.5">→</span>
          {summary.delivery_postcode}
        </span>
      </div>

      {/* ── ROW 3: Companies ── */}
      {(summary.pickup_company || summary.delivery_company) && (
        <div className="px-3 pb-1">
          <span className="text-[11px] text-muted-foreground truncate block">
            {summary.pickup_company || "—"}
            <span className="mx-1">→</span>
            {summary.delivery_company || "—"}
          </span>
        </div>
      )}

      {/* ── ROW 4: Constraints ── */}
      {summary.constraints.length > 0 && (
        <div className="px-3 pb-1 flex flex-wrap gap-1">
          {summary.constraints.slice(0, 3).map((c, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 ${
                c.kind === "do_not_deliver_before" || c.kind === "blocked_until"
                  ? "text-destructive bg-destructive/10"
                  : c.kind === "late_risk"
                  ? "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950"
                  : "text-muted-foreground bg-muted"
              }`}
            >
              {(c.kind === "do_not_deliver_before" || c.kind === "late_risk") && (
                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              )}
              <span className="truncate max-w-[200px]">{c.label}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── ROW 5: Route economics ── */}
      {summary.route_metrics_reliable && (
        <div className="px-3 pb-1 flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Route className="h-3 w-3" />
            {summary.route_distance_miles} mi
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Timer className="h-3 w-3" />
            {summary.route_eta_minutes} min
          </span>
        </div>
      )}

      {/* ── ROW 6: Priority / recommendation ── */}
      {summary.recommendation_reason && (
        <div className="px-3 pb-1.5">
          {priorityRow(summary.priority_state, summary.recommendation_reason)}
        </div>
      )}

      {/* ── ROW 7: Actions ── */}
      <div className="px-3 pb-2.5 flex items-center gap-2">
        <Button
          onClick={(e) => { e.stopPropagation(); onPrimaryAction(); }}
          className="flex-1 min-h-[40px] text-xs font-semibold"
          variant={ctaVariant(summary.priority_state)}
          size="sm"
        >
          {summary.primary_cta.label}
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>

        {summary.current_contact_phone && (
          <Button
            variant="outline"
            size="icon"
            className="h-[40px] w-[40px] shrink-0"
            onClick={(e) => { e.stopPropagation(); window.open(`tel:${summary.current_contact_phone}`); }}
            aria-label={`Call ${summary.current_contact_name}`}
          >
            <Phone className="h-3.5 w-3.5" />
          </Button>
        )}

        {summary.nav_address && (
          <Button
            variant="outline"
            size="icon"
            className="h-[40px] w-[40px] shrink-0"
            onClick={(e) => { e.stopPropagation(); window.open(mapsNavUrl(summary.nav_address), "_blank"); }}
            aria-label="Navigate"
          >
            <Navigation className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}
