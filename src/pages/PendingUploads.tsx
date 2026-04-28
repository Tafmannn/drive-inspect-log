import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EvidenceStatusBadges } from "@/components/EvidenceStatusBadges";
import { useNavigate } from "react-router-dom";
import {
  getPendingUploadsByJob,
  pruneDone,
  retrySingleUpload,
  discardPendingUpload,
  type JobUploadSummary,
} from "@/lib/pendingUploads";
import { triggerRetry, type RetryResult } from "@/lib/retryOrchestrator";

import { AlertTriangle, Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { QueuedSubmissionsSection } from "@/components/QueuedSubmissionsSection";

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
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      await pruneDone();
      const grouped = await getPendingUploadsByJob();
      setJobs(grouped);
    } catch {
      toast({
        title: "Couldn't read pending uploads on this device.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleRetryJob = async (jobId: string) => {
    setRetryingJob(jobId);
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

  const handleRetryItem = async (itemId: string) => {
    setBusyItemId(itemId);
    try {
      const ok = await retrySingleUpload(itemId);
      toast({
        title: ok ? "Photo uploaded." : "Still failing — see error below.",
        variant: ok ? undefined : "destructive",
      });
    } catch (e) {
      toast({
        title: "Retry failed.",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      await refresh();
      setBusyItemId(null);
    }
  };

  const handleConfirmDiscard = async () => {
    if (!confirmDiscardId) return;
    const id = confirmDiscardId;
    setConfirmDiscardId(null);
    setBusyItemId(id);
    try {
      await discardPendingUpload(id);
      toast({ title: "Upload discarded." });
    } catch (e) {
      toast({
        title: "Couldn't discard upload.",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      await refresh();
      setBusyItemId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Pending Uploads" showBack onBack={() => navigate('/')} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <QueuedSubmissionsSection />

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
          const stuck = job.failedItems.filter((f) => f.needsAttention);

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

              {stuck.length > 0 && (
                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-[12px] font-medium text-foreground flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive stroke-[2.5]" />
                    {stuck.length} photo{stuck.length !== 1 ? "s" : ""} need attention
                  </p>
                  {stuck.map((item) => {
                    const isBusy = busyItemId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 space-y-2"
                        data-testid={`failed-item-${item.id}`}
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate">
                            {item.label || String(item.photoType).replace(/_/g, " ")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {item.attempts} attempt{item.attempts !== 1 ? "s" : ""} · auto-retry paused
                          </p>
                        </div>
                        {item.errorMessage && (
                          <p className="text-[11px] font-mono leading-snug text-destructive break-words whitespace-pre-wrap">
                            {item.errorMessage}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleRetryItem(item.id)}
                            disabled={isBusy}
                            className="flex-1 min-h-[40px] rounded-lg"
                            data-testid={`retry-item-${item.id}`}
                          >
                            {isBusy ? (
                              <Loader2 className="mr-1 w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 w-4 h-4 stroke-[2]" />
                            )}
                            Retry
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmDiscardId(item.id)}
                            disabled={isBusy}
                            className="min-h-[40px] rounded-lg text-destructive hover:text-destructive"
                            data-testid={`discard-item-${item.id}`}
                            aria-label="Discard upload"
                          >
                            <Trash2 className="w-4 h-4 stroke-[2]" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={!!confirmDiscardId}
        onOpenChange={(o) => !o && setConfirmDiscardId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this upload?</AlertDialogTitle>
            <AlertDialogDescription>
              The photo will be permanently removed from this device and will
              NOT be uploaded. Use this only if the linked inspection or
              damage entry no longer exists and the upload can never succeed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep upload</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BottomNav />
    </div>
  );
};
