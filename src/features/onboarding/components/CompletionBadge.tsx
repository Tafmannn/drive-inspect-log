/**
 * CompletionBadge — small "X% complete" pill used in lists and detail headers.
 */
import { CompletionResult, completionToneClasses } from "../lib/completion";
import { CheckCircle2, AlertCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export function CompletionBadge({ result, className }: { result: CompletionResult; className?: string }) {
  const Icon = result.status === "complete" ? CheckCircle2 : result.status === "in_progress" ? AlertCircle : Circle;
  const label = result.status === "complete" ? "Complete" : `${result.pct}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        completionToneClasses(result.status),
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
