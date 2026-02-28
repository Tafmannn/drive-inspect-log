import { useState, useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import {
  getPendingUploadsByJob,
  retryJobUploads,
  retryAllPending,
  pruneDone,
  type JobUploadSummary,
} from "@/lib/pendingUploads";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export const PendingUploads = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobUploadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingJob, setRetryingJob] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  const refresh = () => {
    setLoading(true);
    pruneDone();
    const grouped = getPendingUploadsByJob();
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
    <div className="min-h-screen bg-background">
      <AppHeader title="Pending Uploads" showBack onBack={() => navigate(-1)} />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {jobs.length > 0 && (
          <Button onClick={handleRetryAll} disabled={retryingAll} className="w-full">
            {retryingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Retry All ({jobs.length} job{jobs.length !== 1 ? "s" : ""})
          </Button>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!loading && jobs.length === 0 && (
          <p className="text-center py-12 text-muted-foreground">
            No pending uploads. All photos are synced.
          </p>
        )}

        {jobs.map((job) => {
          const totalPending = job.pendingCount + job.failedCount;
          const isRetrying = retryingJob === job.jobId;

          return (
            <Card key={job.jobId} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {job.jobNumber || job.jobId.slice(0, 8)}
                  </p>
                  {job.vehicleReg && (
                    <p className="text-xs text-muted-foreground">{job.vehicleReg}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {job.failedCount > 0 && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {job.failedCount} failed
                    </Badge>
                  )}
                  {job.pendingCount > 0 && (
                    <Badge variant="secondary">{job.pendingCount} pending</Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
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
                >
                  {isRetrying ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" />
                  )}
                  Retry
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
