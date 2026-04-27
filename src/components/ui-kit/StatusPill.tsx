import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusPillTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "advisory";

const toneStyles: Record<StatusPillTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-primary/10 text-primary border-primary/20",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  advisory: "bg-accent/10 text-accent border-accent/20",
};

/**
 * StatusPill — single source of truth for inline status / severity chips.
 * Uses semantic tokens only.
 */
export function StatusPill({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: StatusPillTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        toneStyles[tone],
        className,
      )}
    >
      {icon}
      <span className="truncate max-w-[14rem]">{children}</span>
    </span>
  );
}
