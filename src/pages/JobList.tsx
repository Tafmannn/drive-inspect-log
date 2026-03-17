/**
 * Phase 3 + 6 — My Jobs: Ranked execution launcher.
 * Compact cards with recognition/context/action bands.
 * Shows execution_reason for top-ranked job.
 */
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { useNavigate } from "react-router-dom";
import { useActiveJobs } from "@/hooks/useJobs";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { LauncherCard } from "@/components/LauncherCard";
import { DeviationPrompt } from "@/components/DeviationPrompt";
import { rankJobs, type RankedJob } from "@/lib/executionRanking";
import { logDeviation } from "@/lib/deviationApi";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

function getJobCta(job: RankedJob): { label: string; route: string } {
  if (!job.has_pickup_inspection) return { label: "Start Pickup", route: `/inspection/${job.id}/pickup` };
  if (!job.has_delivery_inspection) return { label: "Start Delivery", route: `/inspection/${job.id}/delivery` };
  return { label: "View POD", route: `/jobs/${job.id}/pod` };
}

export const JobList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: jobs, isLoading } = useActiveJobs();
  const [deviation, setDeviation] = useState<{
    targetJob: RankedJob;
    recommendedJob: RankedJob;
  } | null>(null);

  const rankedJobs = jobs ? rankJobs(jobs).filter(j => j.execution_rank < 7) : [];

  const handleJobAction = (job: RankedJob) => {
    // Check if this is an out-of-sequence action
    const recommended = rankedJobs.find(j => j.is_next_recommended);
    if (
      recommended &&
      recommended.id !== job.id &&
      recommended.execution_rank <= 3 && // only prompt when there's a clear current/recommended
      job.execution_rank > recommended.execution_rank
    ) {
      setDeviation({ targetJob: job, recommendedJob: recommended });
      return;
    }
    const cta = getJobCta(job);
    navigate(cta.route);
  };

  const handleDeviationConfirm = async (reason: string, notes: string) => {
    if (!deviation) return;
    try {
      await logDeviation({
        jobId: deviation.targetJob.id,
        recommendedJobId: deviation.recommendedJob.id,
        reason,
        notes: notes || undefined,
        driverId: user?.id,
      });
    } catch {
      // Non-blocking — log failure shouldn't block the action
    }
    const cta = getJobCta(deviation.targetJob);
    setDeviation(null);
    navigate(cta.route);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="My Jobs" showBack onBack={() => navigate("/")}>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-muted"
          onClick={() => navigate("/jobs/new")}
        >
          <Plus className="w-6 h-6 stroke-[2]" />
        </Button>
      </AppHeader>

      <div className="p-4 max-w-lg mx-auto">
        {isLoading && <DashboardSkeleton />}

        {!isLoading && rankedJobs.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <p className="text-[14px] text-muted-foreground">No active jobs found.</p>
            <Button onClick={() => navigate("/jobs/new")} className="min-h-[44px] rounded-lg">
              Create Job
            </Button>
          </div>
        )}

        {rankedJobs.map((job) => {
          const cta = getJobCta(job);
          return (
            <LauncherCard
              key={job.id}
              job={job}
              ctaLabel={cta.label}
              onPrimaryAction={() => handleJobAction(job)}
              onCardClick={() => navigate(`/jobs/${job.id}`)}
            />
          );
        })}
      </div>

      {deviation && (
        <DeviationPrompt
          open={!!deviation}
          onClose={() => setDeviation(null)}
          onConfirm={handleDeviationConfirm}
          currentJobRef={deviation.recommendedJob.external_job_number || deviation.recommendedJob.id.slice(0, 8)}
          attemptedJobRef={deviation.targetJob.external_job_number || deviation.targetJob.id.slice(0, 8)}
          reason="Complete current job first"
        />
      )}

      <BottomNav />
    </div>
  );
};
