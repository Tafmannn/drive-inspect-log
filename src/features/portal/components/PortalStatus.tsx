import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROGRESS_STEPS,
  STAGE_LABEL,
  progressIndex,
  progressStepLabel,
  type PortalStage,
} from "../lib/portalStatus";

const BADGE_TONE: Record<PortalStage, string> = {
  booked: "bg-muted text-muted-foreground",
  assigned: "bg-muted text-foreground",
  collecting: "bg-primary/10 text-primary",
  in_transit: "bg-primary/10 text-primary",
  delivering: "bg-primary/10 text-primary",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground line-through",
  aborted: "bg-warning/15 text-warning",
  issue: "bg-destructive/10 text-destructive",
};

export function StageBadge({ stage, className }: { stage: PortalStage; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        BADGE_TONE[stage],
        className,
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

export function StageProgress({ stage }: { stage: PortalStage }) {
  const current = progressIndex(stage);
  if (current == null) return null;
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={`Progress: ${STAGE_LABEL[stage]}`}>
      {PROGRESS_STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        // The last step is "done", not "current", once the vehicle is delivered.
        const shown = step === "delivered" && i === current ? "done" : state;
        return (
          <li key={step} className="min-w-0" aria-current={state === "current" ? "step" : undefined}>
            <div className={cn("h-1.5 rounded-full", i <= current ? "bg-primary" : "bg-muted")} />
            <p
              className={cn(
                "mt-1 text-[10px] sm:text-xs leading-tight flex items-start gap-0.5",
                state === "current" ? "text-foreground font-medium" : state === "done" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {shown === "done" && <Check className="w-3 h-3 shrink-0 mt-px" />}
              <span className="min-w-0 break-words">{progressStepLabel(step, shown)}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
