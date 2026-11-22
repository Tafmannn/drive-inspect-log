/**
 * Driver home: the job to do next, with its real primary action, before any
 * stats. Uses the same ranked summaries as My Jobs, so "next" here is exactly
 * the job My Jobs marks as recommended (no deviation prompt needed).
 */
import { useNavigate } from "react-router-dom";
import { ChevronRight, Truck } from "lucide-react";
import { DriverJobCard } from "@/components/DriverJobCard";
import { ListRowsSkeleton } from "@/components/skeletons";
import { OfflineListState } from "@/components/OfflineListState";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDriverJobSummaries } from "./useDriverJobSummaries";

export function UpNextCard() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { summaries, isLoading, isError } = useDriverJobSummaries();
  const next = summaries.find((s) => s.priority_state === "recommended_now") ?? summaries[0];
  const more = summaries.length - (next ? 1 : 0);

  return (
    <section aria-labelledby="up-next-heading" className="space-y-2">
      <div className="flex items-baseline justify-between px-0.5">
        <h2 id="up-next-heading" className="text-[15px] font-semibold text-foreground">
          Up next
        </h2>
        {more > 0 && (
          <button
            type="button"
            onClick={() => navigate("/jobs")}
            className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-[13px] font-medium text-primary"
          >
            {more} more {more === 1 ? "job" : "jobs"}
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading && <ListRowsSkeleton rows={1} />}

      {!isLoading && !next && isError && !online && <OfflineListState noun="jobs" />}

      {!isLoading && !next && !(isError && !online) && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed bg-card p-4">
          <Truck className="h-6 w-6 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-medium text-foreground">No jobs assigned</p>
            <p className="text-[13px] text-muted-foreground">Your admin will assign work when ready.</p>
          </div>
        </div>
      )}

      {!isLoading && next && (
        <DriverJobCard
          summary={next}
          onPrimaryAction={() => navigate(next.primary_cta.route)}
          onCardClick={() => navigate(`/jobs/${next.job_id}`)}
        />
      )}
    </section>
  );
}
