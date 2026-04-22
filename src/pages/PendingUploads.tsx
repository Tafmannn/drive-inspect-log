import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { EvidenceStatusBadges } from "@/components/EvidenceStatusBadges";
import { useNavigate } from "react-router-dom";
import {
  getPendingUploadsByJob,
  pruneDone,
  type JobUploadSummary,
} from "@/lib/pendingUploads";
import { triggerRetry, type RetryResult } from "@/lib/retryOrchestrator";
import { notifyEvidenceQueueChanged } from "@/lib/evidenceQueueBus";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Translate a structured RetryResult into honest, human-readable
 * toast feedback. Both Retry All and per-job Retry route through
 * the same orchestrator and share this messaging.
 */
function toastForRetryResult(result: RetryResult, scope: "all" | "job") {
  switch (result.outcome) {
    case "completed": {
      const { succeeded, failed, purged } = result;
      if (failed > 0) {
        toast({
          title: `Retry finished — ${succeeded} uploaded, ${failed} still failing.`,
          variant: "destructive",
        });
      } else if (succeeded > 0 || purged > 0) {
        const parts: string[] = [];
        if (succeeded > 0) parts.push(`${succeeded} uploaded`);
        if (purged > 0) parts.push(`${purged} purged`);
        toast({ title: `Retry complete — ${parts.join(", ")}.` });
      } else {
        toast({
          title:
            scope === "job"
              ? "Nothing to retry for this job."
              : "No items needed retry.",
        });
      }
      break;
    }
    case "skipped_inflight":
      toast({ title: "Retry already running — please wait." });
      break;
    case "skipped_backoff": {
      const seconds = Math.max(1, Math.ceil((result.retryAfterMs ?? 0) / 1000));
      toast({ title: `Please wait ${seconds}s before retrying again.` });
      break;
    }
    case "failed":
      toast({
        title: "Retry could not start. Check connection and try again.",
        variant: "destructive",
      });
      break;
  }
}

export const PendingUploads = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobUploadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingJob, setRetryingJob] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const refresh = async () => {
    setLoading(true);
    await pruneDone();
    const grouped = await getPendingUploadsByJob();
    setJobs(grouped);
    setLoading(false);
    notifyEvidenceQueueChanged();
  };

  useEffect(() => { refresh(); }, []);

  const handleRetryJob = async (jobId: string) => {
    setRetryingJob(jobId);
    // Per-job retry now flows through the same orchestrator as Retry All
    // so single-flight, backoff and outcome semantics are identical.
    const result = await triggerRetry("manual_job", jobId);
    toastForRetryResult(result, "job");
    await refresh();
    setRetryingJob(null);
  };

  const handleRetryAll = async () => {
    setRetryingAll(true);
    const result = await triggerRetry("manual");
    toastForRetryResult(result, "all");
    await refresh();
    setRetryingAll(false);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Pending Uploads" showBack onBack={() => navigate('/')} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {jobs.length > 0 && (
          <div className="space-y-2">
            <Button
              onClick={handleRetryAll}
              disabled={retryingAll}
              className="w-full min-h-[44px] rounded-lg"
              data-testid="retry-all-btn"
            >
              {retryingAll ? <Loader2 className="mr-2 w-5 h-5 animate-spin" /> : <RefreshCw className="mr-2 w-5 h-5 stroke-[2]" />}
              Retry All ({jobs.length} job{jobs.length !== 1 ? "s" : ""})
            </Button>
            <EvidenceStatusBadges className="justify-center" />
          </div>
        )}

        {loading && <DashboardSkeleton />}

        {!loading && jobs.length === 0 && (
          <div className="text-center py-12">
            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-3 stroke-[2]" />
            <p className="text-[14px] text-muted-foreground">
              No pending uploads. All photos are synced.
            </p>
          </div>
        )}

        {jobs.map((job) => {
          const totalPending = job.pendingCount + job.failedCount;
          const isRetrying = retryingJob === job.jobId;

          return (
            <div key={job.jobId} className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-medium text-foreground truncate">
                    {job.jobNumber || job.jobId.slice(0, 8)}
                  </p>
                  {job.vehicleReg && (
                    <p className="text-[14px] text-muted-foreground">{job.vehicleReg}</p>
                  )}
                </div>
                <EvidenceStatusBadges jobId={job.jobId} />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[13px] text-muted-foreground">
                  {totalPending} upload{totalPending !== 1 ? "s" : ""} remaining
                  {job.lastErrorAt && (
                    <> · Last error {new Date(job.lastErrorAt).toLocaleString()}</>
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRetryJob(job.jobId)}
                  disabled={isRetrying}
                  className="min-h-[44px] rounded-lg"
                  data-testid={`retry-job-${job.jobId}`}
                >
                  {isRetrying ? (
                    <Loader2 className="mr-1 w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 w-4 h-4 stroke-[2]" />
                  )}
                  Retry
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <BottomNav />
    </div>
  );
};
