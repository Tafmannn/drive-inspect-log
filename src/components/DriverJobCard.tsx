/**
 * DriverJobCard — Visual layout matching the detailed card screenshot.
 *
 * Layout:
 * 1. Header: Avatar + client name + job ref | UK plate
 * 2. Status pill
 * 3. Collect From section (contact, phone, company, address)
 * 4. Deliver To section (contact, phone, company, address)
 * 5. Constraint warning strip
 * 6. Full-width primary CTA
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Phone,
  MapPin,
  ChevronRight,
  AlertTriangle,
  User,
} from "lucide-react";
import { getStatusStyle } from "@/lib/statusConfig";
import type { DriverJobSummary } from "@/lib/driverJobSummary";

interface DriverJobCardProps {
  summary: DriverJobSummary;
  onPrimaryAction: () => void;
  onCardClick: () => void;
}

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function DriverJobCard({ summary, onPrimaryAction, onCardClick }: DriverJobCardProps) {
  const status = getStatusStyle(summary._raw.status);
  const initial = (summary.client_name || "?")[0].toUpperCase();

  // Find the first "do_not_deliver_before" constraint for the warning strip
  const deliveryRestriction = summary.constraints.find(
    (c) => c.kind === "do_not_deliver_before"
  );

  return (
    <Card
      className="p-0 mb-2 border border-border overflow-hidden cursor-pointer active:bg-muted/50 transition-colors"
      onClick={onCardClick}
    >
      {/* ── Header: Avatar + Client + Ref | Plate ── */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate leading-tight">
              {summary.client_name}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {summary.job_ref}
            </p>
          </div>
        </div>
        <UKPlate reg={summary.vehicle_reg} />
      </div>

      {/* ── Status pill ── */}
      <div className="px-3 pb-2">
        <span
          style={{ backgroundColor: status.backgroundColor, color: status.color }}
          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide"
        >
          {status.label}
        </span>
      </div>

      {/* ── Collect From ── */}
      <div className="px-3 pb-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Collect From
        </p>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-foreground">
            <User className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{summary.pickup_contact_name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
            <a
              href={`tel:${summary.pickup_contact_phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline truncate"
            >
              {summary.pickup_contact_phone}
            </a>
          </div>
          {summary.pickup_company && (
            <p className="text-[11px] text-muted-foreground pl-5 truncate">
              {summary.pickup_company}
            </p>
          )}
          <div className="flex items-start gap-2 text-xs">
            <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
            <a
              href={mapsUrl(summary.pickup_address_full)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline leading-tight"
            >
              {summary.pickup_address_full}
            </a>
          </div>
        </div>
      </div>

      {/* ── Deliver To ── */}
      <div className="px-3 pb-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Deliver To
        </p>
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-foreground">
            <User className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{summary.delivery_contact_name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
            <a
              href={`tel:${summary.delivery_contact_phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline truncate"
            >
              {summary.delivery_contact_phone}
            </a>
          </div>
          {summary.delivery_company && (
            <p className="text-[11px] text-muted-foreground pl-5 truncate">
              {summary.delivery_company}
            </p>
          )}
          <div className="flex items-start gap-2 text-xs">
            <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
            <a
              href={mapsUrl(summary.delivery_address_full)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline leading-tight"
            >
              {summary.delivery_address_full}
            </a>
          </div>
        </div>
      </div>

      {/* ── Constraint warning strip ── */}
      {deliveryRestriction && (
        <div className="mx-3 mb-2 flex items-center gap-1.5 rounded bg-destructive/10 px-2 py-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
          <span className="text-[11px] font-medium text-destructive truncate">
            {deliveryRestriction.label}
          </span>
        </div>
      )}

      {/* ── Primary CTA ── */}
      <div className="px-3 pb-3">
        <Button
          onClick={(e) => { e.stopPropagation(); onPrimaryAction(); }}
          className="w-full min-h-[44px] text-sm font-semibold"
          size="sm"
        >
          {summary.primary_cta.label}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
