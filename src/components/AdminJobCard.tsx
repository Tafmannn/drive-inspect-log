/**
 * Admin Job Card — extends the Driver Job Card primitive with admin overlay.
 *
 * Adds:
 *   - Driver assignment state (name or "Unassigned" warning)
 *   - Stale cue
 *   - Admin actions: Assign/Reassign, POD
 *
 * Reuses the same visual contract: status-first header, route, alert, actions.
 */

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UKPlate } from "@/components/UKPlate";
import { getStatusStyle } from "@/lib/statusConfig";
import { isJobStale, isUnassigned, canReviewPod, humanAge } from "@/features/control/pages/jobs/jobsUtils";
import {
  MapPin, UserPlus, Eye, ClipboardCheck, AlertTriangle, Clock, User,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

export interface AdminJobRow {
  id: string;
  external_job_number: string | null;
  vehicle_reg: string;
  status: string;
  pickup_city: string;
  pickup_postcode: string;
  delivery_city: string;
  delivery_postcode: string;
  updated_at: string;
  resolvedDriverName: string | null;
  has_pickup_inspection?: boolean;
  has_delivery_inspection?: boolean;
  driver_id: string | null;
}

export interface AdminJobCardProps {
  job: AdminJobRow;
  onView: (job: AdminJobRow) => void;
  onAssign: (job: AdminJobRow) => void;
  onPod?: (job: AdminJobRow) => void;
}

// ── Component ────────────────────────────────────────────────────────

export function AdminJobCard({ job, onView, onAssign, onPod }: AdminJobCardProps) {
  const statusStyle = getStatusStyle(job.status);
  const stale = isJobStale(job);
  const unassigned = isUnassigned(job);
  const showPod = canReviewPod(job);

  return (
    <Card
      className="p-0 border border-border overflow-hidden cursor-pointer active:bg-muted/50 transition-colors"
      onClick={() => onView(job)}
    >
      {/* ── HEADER: status + reg + ref ── */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
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
          {stale && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-warning font-medium shrink-0">
              <Clock className="h-2.5 w-2.5" /> Stale
            </span>
          )}
        </div>
        <UKPlate reg={job.vehicle_reg} />
      </div>

      {/* ── DRIVER OVERLAY ── */}
      <div className="px-3 pb-1.5">
        {unassigned ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning">
            <AlertTriangle className="h-3 w-3" /> Unassigned
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-foreground">
            <User className="h-3 w-3 text-muted-foreground" /> {job.resolvedDriverName}
          </span>
        )}
      </div>

      {/* ── ROUTE ── */}
      <div className="px-3 pb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {job.pickup_city || job.pickup_postcode} → {job.delivery_city || job.delivery_postcode}
          </span>
        </div>
      </div>

      {/* ── ACTIONS ── */}
      <div className="px-3 pb-3 pt-1 flex items-center gap-2">
        {/* Primary: View */}
        <Button
          size="sm"
          className="flex-1 min-h-[40px] text-xs"
          onClick={(e) => { e.stopPropagation(); onView(job); }}
        >
          <Eye className="h-3.5 w-3.5 mr-1" /> View
        </Button>

        {/* Secondary: Assign */}
        <Button
          variant={unassigned ? "default" : "outline"}
          size="sm"
          className={`min-h-[40px] text-xs ${unassigned ? "bg-warning hover:bg-warning/90 text-warning-foreground" : ""}`}
          onClick={(e) => { e.stopPropagation(); onAssign(job); }}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          {unassigned ? "Assign" : "Reassign"}
        </Button>

        {/* Secondary: POD */}
        {showPod && onPod && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-[40px] text-xs"
            onClick={(e) => { e.stopPropagation(); onPod(job); }}
          >
            <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> POD
          </Button>
        )}
      </div>
    </Card>
  );
}
