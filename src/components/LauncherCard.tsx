/**
 * Phase 6 — Compact launcher card for My Jobs.
 * Three bands: recognition, context, action.
 * No workflow bars, no full addresses, no detail metadata.
 */
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { getStatusStyle } from "@/lib/statusConfig";
import { Phone, Navigation, ChevronRight, AlertTriangle, Sparkles } from "lucide-react";
import type { RankedJob } from "@/lib/executionRanking";

interface LauncherCardProps {
  job: RankedJob;
  ctaLabel: string;
  onPrimaryAction: () => void;
  onCardClick: () => void;
}

function mapsNavUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function LauncherCard({ job, ctaLabel, onPrimaryAction, onCardClick }: LauncherCardProps) {
  const statusStyle = getStatusStyle(job.status);

  // Determine active phone and nav address from status
  const isDeliveryPhase = ["pickup_complete", "in_transit", "delivery_in_progress"].includes(job.status);
  const activePhone = isDeliveryPhase ? job.delivery_contact_phone : job.pickup_contact_phone;
  const navAddress = isDeliveryPhase
    ? [job.delivery_address_line1, job.delivery_city, job.delivery_postcode].filter(Boolean).join(", ")
    : [job.pickup_address_line1, job.pickup_city, job.pickup_postcode].filter(Boolean).join(", ");

  const compressedRoute = `${job.pickup_postcode} → ${job.delivery_postcode}`;
  const restriction = job.earliest_delivery_date
    ? `Do not deliver before ${job.earliest_delivery_date}`
    : null;

  return (
    <Card
      className="p-0 mb-2 border border-border overflow-hidden cursor-pointer active:bg-muted/50 transition-colors"
      onClick={onCardClick}
    >
      {/* ── BAND 1: Recognition ── */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{ backgroundColor: statusStyle.backgroundColor, color: statusStyle.color }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none shrink-0"
          >
            {statusStyle.label}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground truncate">
            {job.external_job_number || job.id.slice(0, 8)}
          </span>
        </div>
        <UKPlate reg={job.vehicle_reg} />
      </div>

      {/* ── Execution reason (only for recommended) ── */}
      {job.is_next_recommended && (
        <div className="px-3 pb-1">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/5 rounded px-1.5 py-0.5">
            <Sparkles className="h-2.5 w-2.5" />
            {job.execution_reason}
          </span>
        </div>
      )}
      {!job.is_next_recommended && job.execution_rank <= 3 && (
        <div className="px-3 pb-1">
          <span className="text-[10px] text-muted-foreground">{job.execution_reason}</span>
        </div>
      )}

      {/* ── BAND 2: Context ── */}
      <div className="px-3 pb-1.5">
        <span className="text-[11px] text-muted-foreground">{compressedRoute}</span>
      </div>

      {/* Restriction (compact) */}
      {restriction && (
        <div className="mx-3 mb-1.5 flex items-center gap-1.5 text-[10px] text-warning font-medium">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{restriction}</span>
        </div>
      )}

      {/* ── BAND 3: Action ── */}
      <div className="px-3 pb-2.5 flex items-center gap-2">
        <Button
          onClick={(e) => { e.stopPropagation(); onPrimaryAction(); }}
          className="flex-1 min-h-[40px] text-xs"
          size="sm"
        >
          {ctaLabel}
          <ChevronRight className="ml-1 h-3.5 w-3.5" />
        </Button>

        {activePhone && (
          <Button
            variant="outline"
            size="icon"
            className="h-[40px] w-[40px] shrink-0"
            onClick={(e) => { e.stopPropagation(); window.open(`tel:${activePhone}`); }}
            aria-label="Call contact"
          >
            <Phone className="h-3.5 w-3.5" />
          </Button>
        )}

        {navAddress && (
          <Button
            variant="outline"
            size="icon"
            className="h-[40px] w-[40px] shrink-0"
            onClick={(e) => { e.stopPropagation(); window.open(mapsNavUrl(navAddress), "_blank"); }}
            aria-label="Navigate"
          >
            <Navigation className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}
