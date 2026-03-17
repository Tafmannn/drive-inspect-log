/**
 * Driver Job Card — Canonical Operational Primitive
 *
 * Structure contract:
 *   1. HEADER   — status badge (primary) · vehicle_reg · job ref
 *   2. ROUTE    — pickup → delivery addresses
 *   3. ALERT    — delivery restrictions / special instructions
 *   4. WORKFLOW — pickup → transit → delivery progress
 *   5. ACTIONS  — 1 primary CTA, max 2 secondary
 *
 * Does NOT include: driver name, organisation, audit fields, financial data.
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { getStatusStyle } from "@/lib/statusConfig";
import { MapPin, Phone, Navigation, ChevronRight, AlertTriangle } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

export interface JobCardRoute {
  pickupAddress: string;
  deliveryAddress: string;
  pickupPhone?: string;
  deliveryPhone?: string;
}

export interface JobCardProps {
  /** Vehicle registration */
  reg: string;
  /** Human-friendly job ref e.g. "AX0042" */
  jobRef: string;
  /** Canonical job status */
  status: string;
  /** Pickup / delivery route */
  route: JobCardRoute;
  /** Delivery restriction or special instruction */
  restriction?: string;
  /** Has pickup inspection been completed */
  hasPickupInspection: boolean;
  /** Has delivery inspection been completed */
  hasDeliveryInspection: boolean;
  /** Primary CTA label override */
  ctaLabel?: string;
  /** Primary CTA callback */
  onPrimaryAction?: () => void;
  /** Full-card tap */
  onCardClick?: () => void;
}

// ── Workflow derivation ──────────────────────────────────────────────

type WorkflowStep = "pickup" | "transit" | "delivery";

const WORKFLOW_STEPS: WorkflowStep[] = ["pickup", "transit", "delivery"];

const STEP_LABELS: Record<WorkflowStep, string> = {
  pickup: "Pickup",
  transit: "Transit",
  delivery: "Delivery",
};

function deriveActiveStep(status: string): WorkflowStep | null {
  switch (status) {
    case "ready_for_pickup":
    case "assigned":
    case "pickup_in_progress":
      return "pickup";
    case "pickup_complete":
    case "in_transit":
      return "transit";
    case "delivery_in_progress":
      return "delivery";
    default:
      return null;
  }
}

function isStepComplete(step: WorkflowStep, status: string): boolean {
  const order: Record<WorkflowStep, number> = { pickup: 0, transit: 1, delivery: 2 };
  const completedUpTo: Record<string, number> = {
    pickup_complete: 0,
    in_transit: 0,
    delivery_in_progress: 1,
    delivery_complete: 2,
    pod_ready: 2,
    completed: 2,
  };
  const threshold = completedUpTo[status];
  if (threshold === undefined) return false;
  return order[step] <= threshold;
}

// ── Helpers ──────────────────────────────────────────────────────────

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function mapsNavUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

// ── Component ────────────────────────────────────────────────────────

export const JobCard = ({
  reg,
  jobRef,
  status,
  route,
  restriction,
  hasPickupInspection,
  hasDeliveryInspection,
  ctaLabel,
  onPrimaryAction,
  onCardClick,
}: JobCardProps) => {
  const statusStyle = getStatusStyle(status);
  const activeStep = deriveActiveStep(status);
  const showWorkflow = activeStep !== null;

  // Derive default CTA from status + inspection state
  const derivedCta = ctaLabel ?? deriveCta(status, hasPickupInspection, hasDeliveryInspection);

  // Determine which phone to show as secondary action
  const activePhone = activeStep === "delivery" ? route.deliveryPhone : route.pickupPhone;
  // Navigate destination = current active leg
  const navAddress = activeStep === "delivery" ? route.deliveryAddress : route.pickupAddress;

  return (
    <Card
      className="p-0 mb-3 border border-border overflow-hidden cursor-pointer active:bg-muted/50 transition-colors"
      onClick={onCardClick}
    >
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase leading-none shrink-0"
          >
            {statusStyle.label}
          </span>
          <span className="text-xs font-medium text-muted-foreground truncate">
            Job {jobRef}
          </span>
        </div>
        <div className="shrink-0 ml-2">
          <UKPlate reg={reg} />
        </div>
      </div>

      {/* ── ROUTE ── */}
      <div className="px-4 pb-2 space-y-1.5">
        <RouteRow label="Collect" address={route.pickupAddress} />
        <RouteRow label="Deliver" address={route.deliveryAddress} />
      </div>

      {/* ── ALERT STRIP ── */}
      {restriction && (
        <div className="mx-4 mb-2 p-2 bg-warning/10 border border-warning/20 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <span className="text-xs text-warning font-medium leading-snug">{restriction}</span>
        </div>
      )}

      {/* ── WORKFLOW PROGRESS ── */}
      {showWorkflow && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1">
            {WORKFLOW_STEPS.map((step, i) => {
              const complete = isStepComplete(step, status);
              const active = step === activeStep;
              return (
                <div key={step} className="flex items-center gap-1 flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`h-1.5 w-full rounded-full transition-colors ${
                        complete
                          ? "bg-success"
                          : active
                            ? "bg-primary"
                            : "bg-muted"
                      }`}
                    />
                    <span
                      className={`text-[9px] mt-0.5 font-medium ${
                        complete
                          ? "text-success"
                          : active
                            ? "text-primary"
                            : "text-muted-foreground"
                      }`}
                    >
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ACTIONS ── */}
      <div className="px-4 pb-3 flex items-center gap-2">
        {/* Primary */}
        <Button
          onClick={(e) => {
            e.stopPropagation();
            onPrimaryAction?.();
          }}
          className="flex-1 min-h-[44px]"
          size="default"
        >
          {derivedCta}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>

        {/* Secondary: Call */}
        {activePhone && (
          <Button
            variant="outline"
            size="icon"
            className="h-[44px] w-[44px] shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              window.open(`tel:${activePhone}`);
            }}
            aria-label="Call contact"
          >
            <Phone className="h-4 w-4" />
          </Button>
        )}

        {/* Secondary: Navigate */}
        {navAddress && (
          <Button
            variant="outline"
            size="icon"
            className="h-[44px] w-[44px] shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              window.open(mapsNavUrl(navAddress), "_blank");
            }}
            aria-label="Navigate"
          >
            <Navigation className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
};

// ── Sub-components ───────────────────────────────────────────────────

function RouteRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex items-center gap-1 shrink-0 w-[52px]">
        <MapPin className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      <a
        href={mapsUrl(address)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-xs text-primary hover:underline underline-offset-2 leading-snug min-w-0"
      >
        {address}
      </a>
    </div>
  );
}

// ── CTA derivation ───────────────────────────────────────────────────

function deriveCta(
  status: string,
  hasPickup: boolean,
  hasDelivery: boolean,
): string {
  if (!hasPickup) return "Start Pickup";
  switch (status) {
    case "ready_for_pickup":
    case "assigned":
      return "Start Pickup";
    case "pickup_in_progress":
      return "Continue Pickup";
    case "pickup_complete":
    case "in_transit":
      return hasDelivery ? "View POD" : "Start Delivery";
    case "delivery_in_progress":
      return "Confirm Delivery";
    case "delivery_complete":
    case "pod_ready":
    case "completed":
      return "View POD";
    default:
      return "View Job";
  }
}
