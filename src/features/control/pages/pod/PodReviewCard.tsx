/**
 * Touch-friendly POD review card (phones and tablets). The table on desktop
 * shows the same evidence cues and offers the same actions.
 */
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { getStatusStyle } from "@/lib/statusConfig";
import type { ClosureReviewRow } from "../../hooks/useClosureReview";
import { canConfirmReview } from "./podView";
import {
  AlertTriangle, CheckCircle, ClipboardList, Clock, Eye, FileText, Loader2, MapPin, PenTool, User,
} from "lucide-react";

export interface PodReviewActions {
  onView: (row: ClosureReviewRow) => void;
  onPod: (row: ClosureReviewRow) => void;
  onInspect: (row: ClosureReviewRow) => void;
  onConfirm: (row: ClosureReviewRow) => void;
  confirmingId: string | null;
}

/** Evidence cues shared by the card and the table. */
export function EvidenceCues({ row, compact = false }: { row: ClosureReviewRow; compact?: boolean }) {
  const cls = compact
    ? "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-semibold"
    : "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold";
  const cues: React.ReactNode[] = [];
  if (row.missingDeliveryInspection) {
    cues.push(
      <span key="del" className={`${cls} bg-destructive/10 text-destructive`}>
        <AlertTriangle className="h-2.5 w-2.5" /> No delivery insp.
      </span>,
    );
  }
  if (row.missingPickupInspection) {
    cues.push(
      <span key="pick" className={`${cls} bg-warning/10 text-warning`}>
        <AlertTriangle className="h-2.5 w-2.5" /> No pickup insp.
      </span>,
    );
  }
  if (!row.missingDeliveryInspection && !row.hasCustomerSignature) {
    cues.push(
      <span key="cs" className={`${cls} bg-warning/10 text-warning`}>
        <PenTool className="h-2.5 w-2.5" /> No customer sig.
      </span>,
    );
  }
  if (!row.missingDeliveryInspection && !row.hasDriverSignature) {
    cues.push(
      <span key="ds" className={`${cls} bg-warning/10 text-warning`}>
        <PenTool className="h-2.5 w-2.5" /> No driver sig.
      </span>,
    );
  }
  if (row.isStale && row.band === "review_queue") {
    cues.push(
      <span key="stale" className={`${cls} bg-muted text-muted-foreground`}>
        <Clock className="h-2.5 w-2.5" /> Waiting &gt;4h
      </span>,
    );
  }
  if (cues.length === 0) {
    return compact ? <span className="text-[10px] text-muted-foreground">—</span> : null;
  }
  return <div className="flex flex-wrap gap-1">{cues}</div>;
}

export function PodReviewCard({ row, actions }: { row: ClosureReviewRow; actions: PodReviewActions }) {
  const s = getStatusStyle(row.status);
  const confirming = actions.confirmingId === row.id;

  return (
    <Card
      className="p-0 border border-border overflow-hidden cursor-pointer active:bg-muted/50 transition-colors"
      onClick={() => actions.onView(row)}
    >
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{ backgroundColor: s.backgroundColor, color: s.color }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none shrink-0"
          >
            {s.label}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground truncate">
            {row.external_job_number || row.id.slice(0, 8)}
          </span>
        </div>
        <UKPlate size="compact" reg={row.vehicle_reg} />
      </div>

      <div className="px-3 pb-1.5 space-y-0.5">
        <span className="inline-flex items-center gap-1 text-[11px] text-foreground">
          <User className="h-3 w-3 text-muted-foreground" />
          {row.resolvedDriverName || <span className="text-warning font-medium">Unassigned</span>}
        </span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {row.pickup_city || row.pickup_postcode} → {row.delivery_city || row.delivery_postcode}
          </span>
        </div>
        {(row.client_company || row.client_name) && (
          <p className="text-[11px] text-muted-foreground truncate">{row.client_company || row.client_name}</p>
        )}
      </div>

      <div className="px-3 pb-1.5">
        <EvidenceCues row={row} />
      </div>

      <div className="px-3 pb-3 pt-1 flex flex-wrap items-center gap-2 [&>*]:flex-1">
        <Button
          size="sm"
          className="basis-full min-h-[40px] text-xs"
          onClick={(e) => { e.stopPropagation(); actions.onPod(row); }}
        >
          <FileText className="h-3.5 w-3.5 mr-1" /> Review POD
        </Button>
        {canConfirmReview(row) && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-[40px] text-xs text-primary border-primary/30"
            disabled={confirming}
            onClick={(e) => { e.stopPropagation(); actions.onConfirm(row); }}
          >
            {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
            Confirm
          </Button>
        )}
        {row.missingDeliveryInspection ? (
          <Button
            variant="outline"
            size="sm"
            className="min-h-[40px] text-xs text-warning border-warning/30"
            onClick={(e) => { e.stopPropagation(); actions.onInspect(row); }}
          >
            <ClipboardList className="h-3.5 w-3.5 mr-1" /> Inspect
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="min-h-[40px] text-xs"
            aria-label="View job"
            onClick={(e) => { e.stopPropagation(); actions.onView(row); }}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  );
}
