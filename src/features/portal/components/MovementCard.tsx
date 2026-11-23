import { Link } from "react-router-dom";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalJobSummary } from "../api";
import { STAGE_NEXT, portalStage } from "../lib/portalStatus";
import { fmtDate, fmtDay } from "../lib/format";
import { StageBadge, StageProgress } from "./PortalStatus";
import { portalCard } from "./PortalUi";
import { place, vehicleLine } from "../lib/moveText";

function RoutePoint({ kind, value }: { kind: "From" | "To"; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className={cn(
          "h-2.5 w-2.5 shrink-0 rounded-full border-2",
          kind === "From" ? "border-[#1E4FA8] bg-white dark:bg-card" : "border-[#1E4FA8] bg-[#1E4FA8]",
        )}
      />
      <p className="min-w-0 truncate text-sm text-slate-900 dark:text-foreground">
        <span className="sr-only">{kind}: </span>
        {value}
      </p>
    </div>
  );
}

/**
 * One vehicle move in the list. Shows only what the portal_list_jobs
 * function returns: no live position, no ETA — the scheduled date and the
 * current stage are the real signals.
 */
export function MovementCard({ job, back }: { job: PortalJobSummary; back: string }) {
  const stage = portalStage(job.status);
  const finished = stage === "delivered" || stage === "cancelled" || stage === "aborted";
  return (
    <Link
      to={`/portal/jobs/${job.id}`}
      state={{ back }}
      className="group block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E4FA8] focus-visible:ring-offset-2"
    >
      <article className={cn(portalCard, "flex h-full flex-col p-4 transition-[border-color,box-shadow] duration-150 group-hover:border-[#1E4FA8]/35 group-active:scale-[0.995] motion-reduce:transform-none")}>
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[15px] font-semibold tracking-[0.06em] text-slate-900 dark:border-border dark:bg-muted dark:text-foreground">
              {job.vehicle_reg}
            </p>
            <p className="mt-1.5 truncate text-[13px] text-slate-600 dark:text-muted-foreground">
              {vehicleLine(job)} <span aria-hidden>·</span> Ref {job.job_ref}
            </p>
          </div>
          <StageBadge stage={stage} className="shrink-0" />
        </header>

        <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50/80 px-3 py-2.5 dark:bg-muted/40">
          <RoutePoint kind="From" value={place(job.pickup_city, job.pickup_postcode)} />
          <span aria-hidden className="ml-[4.5px] block h-2.5 border-l border-dashed border-slate-300 dark:border-border" />
          <RoutePoint kind="To" value={place(job.delivery_city, job.delivery_postcode)} />
        </div>

        {!finished && (
          <div className="mt-3">
            {stage === "issue" ? (
              <p className="flex items-start gap-1.5 text-[13px] text-red-700 dark:text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {STAGE_NEXT.issue}
              </p>
            ) : (
              <StageProgress stage={stage} />
            )}
          </div>
        )}

        <div className="mt-auto pt-3" />
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-border">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-slate-600 dark:text-muted-foreground">
            {stage === "delivered" ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                <span className="truncate">Delivered {fmtDate(job.completed_at)}</span>
              </>
            ) : stage === "cancelled" || stage === "aborted" ? (
              <span className="truncate">Booked {fmtDate(job.created_at)}</span>
            ) : job.job_date ? (
              <>
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">Scheduled {fmtDay(job.job_date)}</span>
              </>
            ) : (
              <span className="truncate">Date to be confirmed</span>
            )}
          </p>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-[#1E4FA8] dark:text-primary">
            {stage === "delivered" ? "Condition report" : "View movement"}
            <ChevronRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden />
          </span>
        </footer>
      </article>
    </Link>
  );
}
