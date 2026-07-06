// Grouped "Photo uploads" status overview shown above the per-job list
// on the Pending Uploads screen. Purely presentational — reads the same
// JobUploadSummary[] the screen already loaded via getPendingUploadsByJob,
// so it adds no extra IndexedDB reads and no new transport/queue behaviour.

import { AlertTriangle, ShieldAlert, Upload } from "lucide-react";
import type { JobUploadSummary } from "@/lib/pendingUploads";
import { summarisePhotoUploadsStatus } from "@/lib/photoUploadsStatusSummary";

interface Props {
  jobs: JobUploadSummary[];
}

export function PhotoUploadsStatusGroup({ jobs }: Props) {
  const totals = summarisePhotoUploadsStatus(jobs);
  if (totals.jobCount === 0) return null;

  const groups = [
    {
      key: "pending",
      label: "pending",
      count: totals.pendingCount,
      icon: Upload,
      className:
        "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    },
    {
      key: "failed",
      label: "will retry",
      count: totals.failedCount,
      icon: AlertTriangle,
      className:
        "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
    },
    {
      key: "needs-attention",
      label: "need attention",
      count: totals.needsAttentionCount,
      icon: ShieldAlert,
      className:
        "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
    },
  ].filter((g) => g.count > 0);

  if (groups.length === 0) return null;

  return (
    <div
      className="p-3 rounded-xl bg-card border border-border shadow-sm"
      data-testid="photo-uploads-status-group"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-medium text-foreground">
          Photo uploads
        </p>
        <span className="text-[11px] text-muted-foreground">
          {totals.jobCount} job{totals.jobCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map(({ key, label, count, icon: Icon, className }) => (
          <span
            key={key}
            className={[
              "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium",
              className,
            ].join(" ")}
            data-testid={`photo-uploads-status-${key}`}
          >
            <Icon className="w-3 h-3 stroke-[2.5]" />
            {count} {label}
          </span>
        ))}
      </div>
    </div>
  );
}
