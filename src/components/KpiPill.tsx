import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

/**
 * Compact tappable stat pill: icon, big value, small labelled footer with a
 * chevron. Used by the admin operational dashboard and the driver home's
 * at-a-glance row. Lives in its own module (not in AdminDashboard) so the
 * eager driver home can use it without pulling the heavy admin dashboard
 * chunk into the initial bundle.
 */
export function KpiPill({
  label, value, icon: Icon, variant = "default", loading, onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "warning" | "destructive";
  loading?: boolean;
  onClick: () => void;
}) {
  const styles = {
    default: "bg-card border-border text-muted-foreground",
    warning: "bg-warning/5 border-warning/30 text-warning",
    destructive: "bg-destructive/5 border-destructive/30 text-destructive",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg border p-2.5 min-w-0 flex-1 transition-colors active:bg-muted/50",
        styles[variant],
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {loading ? (
        <Skeleton className="h-5 w-7" />
      ) : (
        <span className="text-base font-bold tabular-nums leading-tight">{value}</span>
      )}
      <span className="w-full flex items-center justify-center gap-0.5 min-w-0">
        <span className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-wider">{label}</span>
        <ChevronRight className="h-2 w-2 shrink-0" />
      </span>
    </button>
  );
}
