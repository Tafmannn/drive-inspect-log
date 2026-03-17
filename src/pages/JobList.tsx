/**
 * My Jobs — Ranked execution launcher.
 * Two-stage lattice: partition → sort → CTA governed by executable state.
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

function getJobCta(job: RankedJob): { label: string; route: string } {
  // Blocked/review_only → view only
  if (job.executable_state === "blocked") {
    return { label: "View Job", route: `/jobs/${job.id}` };
  }
  if (job.executable_state === "review_only") {
    return { label: "View POD", route: `/jobs/${job.id}/pod` };
  }
  // Executable → derive from workflow step
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

  // Exclude terminal from driver view
  const rankedJobs = jobs ? rankJobs(jobs).filter(j => j.execution_class !== "terminal") : [];

  const handleJobAction = (job: RankedJob) => {
    // Blocked jobs → no deviation prompt, just navigate to view
    if (job.executable_state !== "executable") {
      navigate(getJobCta(job).route);
      return;
    }

    // Check for sequence deviation: only if target is executable and there's a clear recommended
    const recommended = rankedJobs.find(j => j.is_next_recommended);
    if (
      recommended &&
      recommended.id !== job.id &&
      recommended.executable_state === "executable" &&
      recommended.execution_rank < job.execution_rank
    ) {
      setDeviation({ targetJob: job, recommendedJob: recommended });
      return;
    }

    navigate(getJobCta(job).route);
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
      // Non-blocking
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
              ctaVariant={job.executable_state === "executable" ? "default" : "outline"}
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
