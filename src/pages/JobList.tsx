/**
 * My Jobs — Decision-optimized driver launcher.
 * Uses DriverJobSummary model for each card.
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
import { DriverJobCard } from "@/components/DriverJobCard";
import { DeviationPrompt } from "@/components/DeviationPrompt";
import { rankJobs, type RankedJob } from "@/lib/executionRanking";
import { deriveJobSummaries, type DriverJobSummary } from "@/lib/driverJobSummary";
import { logDeviation } from "@/lib/deviationApi";
import { useAuth } from "@/context/AuthContext";

export const JobList = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const gate = useDriverGate();
  const { data: jobs, isLoading } = useActiveJobs();
  const [deviation, setDeviation] = useState<{
    target: DriverJobSummary;
    recommended: DriverJobSummary;
  } | null>(null);

  // Scope BEFORE ranking so cross-driver route-adjacency comparisons don't
  // corrupt the sort, and so deriveJobSummaries sees the same job set that
  // rankJobs used when computing is_next_recommended.
  const driverScoped = jobs
    ? (gate.isDriverOnly && gate.driverProfileId)
      ? jobs.filter(j => j.driver_id === gate.driverProfileId)
      : jobs
    : [];
  const scoped = rankJobs(driverScoped).filter(j => j.execution_class !== "terminal");
  const summaries = deriveJobSummaries(scoped);

  const isDriverOnly = gate.isDriverOnly;

  const handleJobAction = (summary: DriverJobSummary) => {
    // If blocked or review-only, go directly
    if (summary.priority_state === "blocked" || summary.workflow_state === "pending_review" || summary.workflow_state === "terminal") {
      navigate(summary.primary_cta.route);
      return;
    }

    // Check deviation: is this not the recommended job?
    const recommended = summaries.find(s => s.priority_state === "recommended_now");
    if (recommended && recommended.job_id !== summary.job_id && recommended.priority_state === "recommended_now") {
      setDeviation({ target: summary, recommended });
      return;
    }

    navigate(summary.primary_cta.route);
  };

  const handleDeviationConfirm = async (reason: string, notes: string) => {
    if (!deviation) return;
    try {
      await logDeviation({
        jobId: deviation.target.job_id,
        recommendedJobId: deviation.recommended.job_id,
        reason,
        notes: notes || undefined,
        driverId: user?.id,
      });
    } catch { /* Non-blocking */ }
    const route = deviation.target.primary_cta.route;
    setDeviation(null);
    navigate(route);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="My Jobs" showBack onBack={() => navigate("/")}>
        <RoleScope admin>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-muted"
            onClick={() => navigate("/jobs/new")}
          >
            <Plus className="w-6 h-6 stroke-[2]" />
          </Button>
        </RoleScope>
      </AppHeader>

      <div className="p-4 max-w-lg mx-auto">
        {isLoading && <DashboardSkeleton />}

        {!isLoading && summaries.length === 0 && (
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
            <RoleScope admin>
              <Button onClick={() => navigate("/jobs/new")} className="min-h-[44px] rounded-lg">
                Create Job
              </Button>
            </RoleScope>
          </div>
        )}

        {summaries.map((summary) => (
          <DriverJobCard
            key={summary.job_id}
            summary={summary}
            onPrimaryAction={() => handleJobAction(summary)}
            onCardClick={() => navigate(`/jobs/${summary.job_id}`)}
          />
        ))}
      </div>

      {deviation && (
        <DeviationPrompt
          open={!!deviation}
          onClose={() => setDeviation(null)}
          onConfirm={handleDeviationConfirm}
          currentJobRef={deviation.recommended.job_ref}
          attemptedJobRef={deviation.target.job_ref}
          reason="Complete current job first"
        />
      )}

      <BottomNav />
    </div>
  );
};
