/**
 * The driver's active jobs as decision-ready summaries — scoped to the driver,
 * ranked, terminal jobs removed, POD CTA hidden when not allowed. Shared by
 * My Jobs and the driver home ("Up next") so both always agree.
 */
import { useActiveJobs } from "@/hooks/useJobs";
import { useDriverGate } from "@/hooks/useDriverGate";
import { useCanViewPod } from "@/hooks/useCanViewPod";
import { rankJobs } from "@/lib/executionRanking";
import { deriveJobSummaries, withoutPodCta } from "@/lib/driverJobSummary";

export function useDriverJobSummaries() {
  const gate = useDriverGate();
  const canViewPod = useCanViewPod();
  const { data: jobs, isLoading, isError, refetch } = useActiveJobs();
  // Scope BEFORE ranking so cross-driver route-adjacency comparisons don't
  // corrupt the sort, and so deriveJobSummaries sees the same job set that
  // rankJobs used when computing is_next_recommended.
  const driverScoped = jobs
    ? gate.isDriverOnly && gate.driverProfileId
      ? jobs.filter((j) => j.driver_id === gate.driverProfileId)
      : jobs
    : [];
  const scoped = rankJobs(driverScoped).filter((j) => j.execution_class !== "terminal");
  const derived = deriveJobSummaries(scoped);
  const summaries = canViewPod ? derived : derived.map(withoutPodCta);
  return { summaries, isLoading, isError, refetch, isDriverOnly: gate.isDriverOnly };
}
