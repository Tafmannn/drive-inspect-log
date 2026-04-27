import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type DeltaDirection = "higher" | "lower" | "equal" | "unknown";
type DeltaSeverity = "none" | "minor" | "moderate" | "major";

interface DeltaBadgeProps {
  direction: DeltaDirection;
  /** Human label, e.g. "+£25.00 (25%) vs current". */
  label: string;
  /** When true, uses a warning tone to flag a notable swing. */
  warn?: boolean;
  severity?: DeltaSeverity;
  className?: string;
}

/**
 * DeltaBadge — visual delta between current and suggested values. Shared
 * styling so all "vs current" comparisons look identical.
 */
export function DeltaBadge({
  direction,
  label,
  warn,
  severity,
  className,
}: DeltaBadgeProps) {
  if (direction === "unknown") return null;

  const Icon =
    direction === "higher" ? TrendingUp : direction === "lower" ? TrendingDown : Minus;

  const tone = warn
    ? "text-warning"
    : direction === "equal"
      ? "text-muted-foreground"
      : "text-foreground/70";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      {warn && severity && severity !== "none" && (
        <span className="rounded-md border border-warning/30 bg-warning/10 text-warning px-1.5 py-0 text-[10px] uppercase tracking-wide">
          {severity} swing
        </span>
      )}
    </div>
  );
}
