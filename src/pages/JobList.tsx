/**
 * My Jobs — Ranked execution launcher.
 * Driver-scoped: only shows jobs assigned to the current driver.
 * Admin/SuperAdmin: shows all active jobs (existing behavior).
 */
import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { useNavigate } from "react-router-dom";
import { useActiveJobs } from "@/hooks/useJobs";
import { useDriverGate } from "@/hooks/useDriverGate";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { LauncherCard } from "@/components/LauncherCard";
import { DeviationPrompt } from "@/components/DeviationPrompt";
import { rankJobs, type RankedJob } from "@/lib/executionRanking";
import { logDeviation } from "@/lib/deviationApi";
import { useAuth } from "@/context/AuthContext";

function getJobCta(job: RankedJob): { label: string; route: string } {
  if (job.executable_state === "blocked") {
    return { label: "View Job", route: `/jobs/${job.id}` };
  }
  if (job.executable_state === "review_only") {
    return { label: "View POD", route: `/jobs/${job.id}/pod` };
  }
  if (!job.has_pickup_inspection) return { label: "Start Pickup", route: `/inspection/${job.id}/pickup` };
  if (!job.has_delivery_inspection) return { label: "Start Delivery", route: `/inspection/${job.id}/delivery` };
  return { label: "View POD", route: `/jobs/${job.id}/pod` };
}

export const JobList = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const gate = useDriverGate();
  const { data: jobs, isLoading } = useActiveJobs();
  const [deviation, setDeviation] = useState<{
    targetJob: RankedJob;
    recommendedJob: RankedJob;
  } | null>(null);

  // Scope jobs for driver-only users: only show jobs assigned to their driver profile
  const allRanked = jobs ? rankJobs(jobs).filter(j => j.execution_class !== "terminal") : [];
  const rankedJobs = (gate.isDriverOnly && gate.driverProfileId)
    ? allRanked.filter(j => j.driver_id === gate.driverProfileId)
    : allRanked;

  const isDriverOnly = gate.isDriverOnly;

  const handleJobAction = (job: RankedJob) => {
    if (job.executable_state !== "executable") {
      navigate(getJobCta(job).route);
      return;
    }
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
    } catch { /* Non-blocking */ }
    const cta = getJobCta(deviation.targetJob);
    setDeviation(null);
    navigate(cta.route);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="My Jobs" showBack onBack={() => navigate("/")}>
        {/* Only admins can create jobs */}
        {(isAdmin || isSuperAdmin) && (
          <Button
            size="sm"
            variant="ghost"
            className="min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-muted"
            onClick={() => navigate("/jobs/new")}
          >
            <Plus className="w-6 h-6 stroke-[2]" />
          </Button>
        )}
      </AppHeader>

      <div className="p-4 max-w-lg mx-auto">
        {isLoading && <DashboardSkeleton />}

        {!isLoading && rankedJobs.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <Truck className="w-12 h-12 mx-auto text-muted-foreground stroke-[1.5]" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No jobs assigned</p>
              <p className="text-[13px] text-muted-foreground">
                {isDriverOnly
                  ? "Your admin will assign work when ready."
                  : "No active jobs found."
                }
              </p>
            </div>
            {(isAdmin || isSuperAdmin) && (
              <Button onClick={() => navigate("/jobs/new")} className="min-h-[44px] rounded-lg">
                Create Job
              </Button>
            )}
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
