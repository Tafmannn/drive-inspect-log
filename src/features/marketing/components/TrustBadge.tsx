import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrustBadgeProps {
  label: string;
  icon: LucideIcon;
  tone?: "light" | "dark";
  className?: string;
}

/** Icon + short defensible trust statement (no statistics). */
export function TrustBadge({ label, icon: Icon, tone = "light", className }: TrustBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-4",
        tone === "dark"
          ? "border-white/10 bg-white/5"
          : "border-marketing-border bg-white shadow-marketing-sm",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          tone === "dark" ? "bg-marketing-electric/15 text-marketing-electric" : "bg-marketing-success/10 text-marketing-success",
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span
        className={cn(
          "text-sm font-medium",
          tone === "dark" ? "text-marketing-on-dark" : "text-marketing-text",
        )}
      >
        {label}
      </span>
    </div>
  );
}
