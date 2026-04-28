import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface KpiItem {
  label: string;
  value?: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "warning" | "destructive" | "info";
  loading?: boolean;
  /** Optional destination — when set, the entire card becomes a tappable link. */
  href?: string;
  /** Optional click handler — used when no href is provided. */
  onClick?: () => void;
  /** Optional aria-label override for assistive tech. */
  ariaLabel?: string;
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
    <div
      className={cn(
        "grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {items.map((item, i) => (
        <KpiCard key={i} {...item} />
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  variant = "default",
  loading,
  href,
  onClick,
  ariaLabel,
}: KpiItem) {
  const interactive = Boolean(href || onClick);

  const baseClass = cn(
    "group rounded-xl border bg-card p-4 flex items-center gap-3 min-w-0 h-full shadow-sm",
    // ensure ≥56px tap target on mobile, slightly tighter on desktop
    "min-h-[88px] lg:min-h-[76px]",
    interactive &&
      "text-left w-full transition-all active:scale-[0.98] hover:border-primary/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer",
  );

  const inner = (
    <>
      {Icon && (
        <div
          className={cn(
            "h-11 w-11 lg:h-10 lg:w-10 rounded-lg flex items-center justify-center shrink-0",
            iconBg[variant],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {loading ? (
          <Skeleton className="h-7 w-14 mb-1" />
        ) : (
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums leading-tight",
              variantStyles[variant],
            )}
          >
            {value ?? "—"}
          </p>
        )}
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </p>
      </div>
    </>
  );

  const a11yLabel = ariaLabel ?? `${label}: ${value ?? "—"}`;

  if (href) {
    return (
      <Link to={href} className={baseClass} aria-label={a11yLabel}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClass} aria-label={a11yLabel}>
        {inner}
      </button>
    );
  }

  return <div className={baseClass}>{inner}</div>;
}

