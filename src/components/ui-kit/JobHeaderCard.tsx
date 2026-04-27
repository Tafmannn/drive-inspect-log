/**
 * JobHeaderCard — shared identity block for a job across surfaces.
 *
 * Used by JobDetail, PodReport, and any future surface that opens with the
 * canonical "status pill · job ref · UK plate · vehicle line" header.
 *
 * Pure presentational. All data is passed in. Status colours come from the
 * existing `getStatusStyle` map at the call site so this primitive does not
 * re-import status logic.
 */
import type { ReactNode } from "react";
import { Building } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UKPlate } from "@/components/UKPlate";

interface JobHeaderCardProps {
  /** External job number or short id, e.g. "AX1234". */
  jobRef: string;
  /** UK registration plate, rendered with <UKPlate>. */
  vehicleReg: string;
  /** Pre-styled status badge — { backgroundColor, color, label }. */
  status: {
    backgroundColor: string;
    color: string;
    label: string;
  };
  /** Vehicle make. */
  make?: string | null;
  /** Vehicle model. */
  model?: string | null;
  /** Vehicle colour. */
  colour?: string | null;
  /** Vehicle year. */
  year?: string | number | null;
  /** Optional client line (company/name). */
  client?: string | null;
  /** Optional client email appended after a separator. */
  clientEmail?: string | null;
  /** UKPlate variant — "front" (default) or "rear". */
  plateVariant?: "front" | "rear";
  /** Right-aligned slot inside the header row (e.g. EvidenceStatusBadges). */
  rightSlot?: ReactNode;
  /** Children rendered beneath the identity block (e.g. progress bar). */
  children?: ReactNode;
  className?: string;
}

export function JobHeaderCard({
  jobRef,
  vehicleReg,
  status,
  make,
  model,
  colour,
  year,
  client,
  clientEmail,
  plateVariant,
  rightSlot,
  children,
  className,
}: JobHeaderCardProps) {
  return (
    <Card className={`p-4 rounded-xl bg-card border border-border shadow-sm space-y-2 ${className ?? ""}`}>
      <div className="flex items-center justify-between mb-1">
        <span
          style={{ backgroundColor: status.backgroundColor, color: status.color }}
          className="inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold uppercase leading-none"
        >
          {status.label}
        </span>
        <UKPlate reg={vehicleReg} variant={plateVariant} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Job {jobRef}</p>
        {rightSlot}
      </div>

      {(make || model || colour || year) && (
        <p className="text-sm text-foreground">
          {make} {model}
          {colour && (
            <>
              <span className="text-muted-foreground"> — </span>
              <span className="text-foreground">{colour}</span>
            </>
          )}
          {year && <span className="text-muted-foreground"> ({year})</span>}
        </p>
      )}

      {client && (
        <div className="flex items-center gap-1.5">
          <Building className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {client}
            {clientEmail && ` · ${clientEmail}`}
          </span>
        </div>
      )}

      {children}
    </Card>
  );
}
