/**
 * ControlCenterShell — a reusable layout wrapper for control centre pages.
 * Handles consistent spacing, max-width, and section stacking.
 */
import { cn } from "@/lib/utils";

export function ControlShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-1 overflow-y-auto", className)}>
      <div className="mx-auto max-w-[1600px] p-5 lg:p-6 space-y-5">
        {children}
      </div>
    </div>
  );
}

/** Header strip for control pages with title + optional actions */
export function ControlHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/** Section container with optional title */
export function ControlSection({
  title,
  description,
  actions,
  children,
  className,
  flush,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("rounded-lg border bg-card", flush ? "" : "p-4", className)}>
      {title && (
        <div className={cn("flex items-start justify-between gap-3", flush ? "px-4 pt-4" : "", "mb-3")}>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
