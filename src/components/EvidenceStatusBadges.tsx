// Lightweight evidence-lifecycle status surface.
//
// Renders human-readable counts of pending / failed evidence uploads
// for a given job (or globally if no jobId provided). All mounted
// instances share a single change signal via evidenceQueueBus, which
// is broadcast from the canonical lifecycle layer (pendingUploads.ts)
// after any retry / prune / discard / promote / purge / delete. So a
// retry on one screen — or in another tab — instantly refreshes
// badges on every other mounted surface, with no per-screen polling.
//
// Refresh strategy:
//   - One initial load on mount.
//   - Re-read whenever the shared evidence-queue version changes.

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CloudUpload, AlertTriangle } from "lucide-react";
import {
  getPendingUploadsByJob,
  type JobUploadSummary,
} from "@/lib/pendingUploads";
import { useEvidenceQueueVersion } from "@/lib/evidenceQueueBus";

interface Props {
  jobId?: string;
  /** Optional className passthrough for the wrapper. */
  className?: string;
}

export function EvidenceStatusBadges({ jobId, className }: Props) {
  const [summary, setSummary] = useState<JobUploadSummary | null>(null);
  const [globalPending, setGlobalPending] = useState(0);
  const [globalFailed, setGlobalFailed] = useState(0);
  const queueVersion = useEvidenceQueueVersion();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const groups = await getPendingUploadsByJob();
        if (cancelled) return;
        if (jobId) {
          setSummary(groups.find((g) => g.jobId === jobId) ?? null);
        } else {
          let p = 0;
          let f = 0;
          for (const g of groups) {
            p += g.pendingCount;
            f += g.failedCount;
          }
          setGlobalPending(p);
          setGlobalFailed(f);
        }
      } catch {
        /* best-effort — leave previous counts visible rather than flicker */
      }
    };
    load();
    return () => { cancelled = true; };
  }, [jobId, queueVersion]);

  const pending = jobId ? summary?.pendingCount ?? 0 : globalPending;
  const failed = jobId ? summary?.failedCount ?? 0 : globalFailed;

  if (pending === 0 && failed === 0) return null;

  return (
    <div
      className={`flex items-center gap-1.5 ${className ?? ""}`}
      data-testid="evidence-status-badges"
    >
      {pending > 0 && (
        <Badge
          variant="secondary"
          className="gap-1 text-[11px] font-medium"
          title="Photos waiting to upload from this device"
        >
          <CloudUpload className="w-3 h-3" />
          {pending} uploading
        </Badge>
      )}
      {failed > 0 && (
        <Badge
          variant="destructive"
          className="gap-1 text-[11px] font-medium"
          title="Photos that failed to upload — tap Pending Uploads to retry"
        >
          <AlertTriangle className="w-3 h-3" />
          {failed} failed
        </Badge>
      )}
    </div>
  );
}
