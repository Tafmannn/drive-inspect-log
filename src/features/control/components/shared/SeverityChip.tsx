import { cn } from "@/lib/utils";

type Severity = "critical" | "high" | "medium" | "low";

const styles: Record<Severity, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/25",
  high: "bg-destructive/10 text-destructive border-destructive/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  low: "bg-muted text-muted-foreground border-border",
};

export function SeverityChip({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        styles[severity],
        className
      )}
    >
      {severity}
    </span>
  );
}
