import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricBlockProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Optional badge or trailing element on the value row. */
  trailing?: ReactNode;
  /** Use a muted subdued style for "current" values vs primary for headline. */
  tone?: "headline" | "muted";
  className?: string;
}

/**
 * MetricBlock — consistent label / value / hint stack for KPI-like values
 * (e.g. "Suggested £125.00" vs "Current £100.00").
 */
export function MetricBlock({
  label,
  value,
  hint,
  trailing,
  tone = "muted",
  className,
}: MetricBlockProps) {
  return (
    <div className={cn("space-y-0.5 min-w-0", className)}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </p>
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <span
          className={cn(
            tone === "headline"
              ? "text-2xl font-bold tracking-tight text-foreground"
              : "text-lg font-semibold text-foreground/80",
          )}
        >
          {value}
        </span>
        {trailing}
      </div>
      {hint && (
        <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
      )}
    </div>
  );
}
