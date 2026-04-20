import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  getPendingUploadsByJob,
  retryJobUploads,
  retryAllPending,
  pruneDone,
  type JobUploadSummary,
} from "@/lib/pendingUploads";
import { Loader2, RefreshCw, AlertTriangle, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
  };

  useEffect(() => { refresh(); }, []);

  const handleRetryJob = async (jobId: string) => {
    setRetryingJob(jobId);
    const { succeeded, failed } = await retryJobUploads(jobId);
    if (failed > 0) {
      toast({ title: `${failed} upload(s) still failing. Tap to retry.`, variant: "destructive" });
    } else {
      toast({ title: `${succeeded} upload(s) complete.` });
    }
    refresh();
    setRetryingJob(null);
  };

  const handleRetryAll = async () => {
    setRetryingAll(true);
    const { succeeded, failed } = await retryAllPending();
    toast({
      title: failed > 0
        ? `Some uploads failed. ${succeeded} succeeded, ${failed} failed.`
        : "All uploads complete.",
      variant: failed > 0 ? "destructive" : "default",
    });
    refresh();
    setRetryingAll(false);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Pending Uploads" showBack onBack={() => navigate('/')} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {jobs.length > 0 && (
          <Button onClick={handleRetryAll} disabled={retryingAll} className="w-full min-h-[44px] rounded-lg">
            {retryingAll ? <Loader2 className="mr-2 w-5 h-5 animate-spin" /> : <RefreshCw className="mr-2 w-5 h-5 stroke-[2]" />}
            Retry All ({jobs.length} job{jobs.length !== 1 ? "s" : ""})
          </Button>
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
                <div className="flex items-center gap-2">
                  {job.failedCount > 0 && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {job.failedCount} failed
                    </Badge>
                  )}
                  {job.pendingCount > 0 && (
                    <Badge variant="secondary">{job.pendingCount} pending</Badge>
                  )}
                </div>
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
