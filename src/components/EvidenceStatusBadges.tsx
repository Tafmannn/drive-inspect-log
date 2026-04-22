// Lightweight evidence-lifecycle status surface.
//
// Renders human-readable counts of pending / failed evidence uploads
// for a given job (or globally if no jobId provided). Uses semantic
// design tokens only.
//
// This does NOT imply success state on its own — it surfaces the
// underlying queue truth so drivers and admins can see when local
// evidence is still mid-flight.
//
// Refresh strategy:
//   - One initial load on mount.
//   - A `refreshKey` prop lets parents trigger a re-read after they
//     cause a queue mutation (e.g. retry tap, queue mutation event).
//   - A low-frequency 30s interval acts as a fallback safety net so the
//     UI converges even if the parent forgets to bump refreshKey. This
//     is intentionally infrequent — the queue is local IDB, not a
//     network round-trip — so it does not cause noisy renders.

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CloudUpload, AlertTriangle } from "lucide-react";
import {
  getPendingUploadsByJob,
  type JobUploadSummary,
} from "@/lib/pendingUploads";

interface Props {
  jobId?: string;
  /** Optional className passthrough for the wrapper. */
  className?: string;
  /** Bump to force a re-read after a known queue mutation. */
  refreshKey?: number | string;
}

export function EvidenceStatusBadges({ jobId, className, refreshKey }: Props) {
  const [summary, setSummary] = useState<JobUploadSummary | null>(null);
  const [globalPending, setGlobalPending] = useState(0);
  const [globalFailed, setGlobalFailed] = useState(0);

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
        /* best-effort */
      }
    };
    load();
    // Low-frequency safety-net refresh; parents should also bump refreshKey
    // after known mutations for snappier feedback.
    const interval = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [jobId, refreshKey]);

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
