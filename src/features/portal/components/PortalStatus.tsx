import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROGRESS_STEPS,
  STAGE_LABEL,
  progressIndex,
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

const STEP_LABEL: Record<string, string> = {
  booked: "Booked",
  collecting: "Collected",
  in_transit: "In transit",
  delivered: "Delivered",
};

export function StageProgress({ stage }: { stage: PortalStage }) {
  const current = progressIndex(stage);
  if (current == null) return null;
  return (
    <ol className="flex items-center gap-1" aria-label={`Progress: ${STAGE_LABEL[stage]}`}>
      {PROGRESS_STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step} className="flex-1 min-w-0">
            <div className={cn("h-1.5 rounded-full", done ? "bg-primary" : "bg-muted")} />
            <p
              className={cn(
                "mt-1 text-[10px] sm:text-xs truncate flex items-center gap-0.5",
                done ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {done && i < current && <Check className="w-3 h-3 shrink-0" />}
              {STEP_LABEL[step]}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
