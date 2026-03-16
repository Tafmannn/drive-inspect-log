import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface KpiItem {
  label: string;
  value?: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "warning" | "destructive" | "info";
  loading?: boolean;
}

const variantStyles: Record<string, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
};

const iconBg: Record<string, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export function KpiStrip({
  items,
  className,
}: {
  items: KpiItem[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", className)} style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 6)}, minmax(0, 1fr))` }}>
      {items.map((item, i) => (
        <KpiCard key={i} {...item} />
      ))}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, variant = "default", loading }: KpiItem) {
  return (
    <div className="rounded-lg border bg-card p-3.5 flex items-center gap-3 min-w-0">
      {Icon && (
        <div className={cn("h-9 w-9 rounded-md flex items-center justify-center shrink-0", iconBg[variant])}>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0">
        {loading ? (
          <Skeleton className="h-7 w-14 mb-1" />
        ) : (
          <p className={cn("text-xl font-semibold tabular-nums leading-tight", variantStyles[variant])}>
            {value ?? "—"}
          </p>
        )}
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
      </div>
    </div>
  );
}
