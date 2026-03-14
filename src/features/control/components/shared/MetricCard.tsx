import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function MetricCard({
  label,
  value,
  change,
  loading,
  icon: Icon,
  className,
}: {
  label: string;
  value?: string | number;
  change?: string;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground tabular-nums">
            {value ?? "—"}
          </span>
          {change && (
            <span className="text-xs text-muted-foreground">{change}</span>
          )}
        </div>
      )}
    </div>
  );
}
