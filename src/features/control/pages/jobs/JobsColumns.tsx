/**
 * Column definitions for the Jobs dispatch table.
 * Extracted from ControlJobs to keep the page file slim.
 */
import type { CompactColumn } from "../../components/shared/CompactTable";
import type { JobControlRow } from "../../hooks/useControlJobsData";
import { UKPlate } from "@/components/UKPlate";
import { Button } from "@/components/ui/button";
import { getStatusStyle } from "@/lib/statusConfig";
import {
  Eye, UserPlus, ClipboardCheck, FileText, Receipt,
  AlertTriangle, Clock,
} from "lucide-react";
import {
  humanAge, isJobStale, isUnassigned, canReviewPod, canAddExpense,
} from "./jobsUtils";

// ─── Types for action callbacks ──────────────────────────────────────
export interface JobsColumnActions {
  onView: (row: JobControlRow) => void;
  onAssign: (row: JobControlRow) => void;
  onReviewPod: (row: JobControlRow) => void;
  onAddExpense: (row: JobControlRow) => void;
}

// ─── Column factory ──────────────────────────────────────────────────
export function buildJobColumns(actions: JobsColumnActions): CompactColumn<JobControlRow>[] {
  return [
    // 1. Job reference
    {
      key: "ref",
      header: "Ref",
      className: "w-[100px]",
      render: (r) => (
        <span className="text-xs font-semibold text-foreground">
          {r.external_job_number || r.id.slice(0, 8)}
        </span>
      ),
    },
    // 2. Vehicle identity
    {
      key: "vehicle",
      header: "Vehicle",
      className: "w-[130px]",
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <UKPlate reg={r.vehicle_reg} />
          <span className="text-[10px] text-muted-foreground truncate">
            {[r.vehicle_make, r.vehicle_model].filter(Boolean).join(" ")}
          </span>
        </div>
      ),
    },
    // 3. Client
    {
      key: "client",
      header: "Client",
      className: "w-[120px]",
      render: (r) => (
        <span className="text-xs text-foreground truncate block max-w-[120px]">
          {r.client_company || r.client_name || "—"}
        </span>
      ),
    },
    // 4. Driver assignment state
    {
      key: "driver",
      header: "Driver",
      className: "w-[120px]",
      render: (r) =>
        r.resolvedDriverName ? (
          <span className="text-xs text-foreground">{r.resolvedDriverName}</span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            Unassigned
          </span>
        ),
    },
    // 5. Route context — pickup → delivery postcodes with cities
    {
      key: "route",
      header: "Route",
      render: (r) => (
        <div className="flex flex-col gap-0">
          <span className="text-xs text-foreground whitespace-nowrap">
            {r.pickup_postcode} → {r.delivery_postcode}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            {[r.pickup_city, r.delivery_city].filter(Boolean).join(" → ")}
          </span>
        </div>
      ),
    },
    // 6. Canonical status + truthful secondary cues
    {
      key: "status",
      header: "Status",
      className: "w-[120px]",
      render: (r) => {
        const s = getStatusStyle(r.status);
        const stale = isJobStale(r);
        return (
          <div className="flex flex-col gap-0.5">
            <span
              style={{ backgroundColor: s.backgroundColor, color: s.color }}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase whitespace-nowrap w-fit"
            >
              {s.label}
            </span>
            {stale && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-warning font-medium">
                <Clock className="h-2.5 w-2.5" />
                Stale
              </span>
            )}
          </div>
        );
      },
    },
    // 7. Updated age
    {
      key: "age",
      header: "Updated",
      className: "w-[65px] text-right",
      render: (r) => (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {humanAge(r.updated_at)}
        </span>
      ),
    },
    // 8. Actions — contextual, not redundant
    {
      key: "actions",
      header: "",
      className: "w-[200px] text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={(e) => { e.stopPropagation(); actions.onView(r); }}
          >
            <Eye className="h-3 w-3 mr-0.5" /> View
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={`h-6 text-[10px] px-2 ${isUnassigned(r) ? "text-warning" : ""}`}
            onClick={(e) => { e.stopPropagation(); actions.onAssign(r); }}
          >
            <UserPlus className="h-3 w-3 mr-0.5" />
            {r.resolvedDriverName ? "Reassign" : "Assign"}
          </Button>

          {canReviewPod(r) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-info"
              onClick={(e) => { e.stopPropagation(); actions.onReviewPod(r); }}
            >
              <ClipboardCheck className="h-3 w-3 mr-0.5" /> POD
            </Button>
          )}

          {canAddExpense(r) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={(e) => { e.stopPropagation(); actions.onAddExpense(r); }}
            >
              <Receipt className="h-3 w-3 mr-0.5" /> Expense
            </Button>
          )}
        </div>
      ),
    },
  ];
}
