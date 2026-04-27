import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface SectionHeaderProps {
  icon?: ReactNode;
  title: string;
  /** Small uppercase eyebrow above the title. */
  eyebrow?: string;
  /** Trailing right-side content (badges, buttons, loading spinner). */
  right?: ReactNode;
  /** Show an "Admin only" chip. */
  adminOnly?: boolean;
  className?: string;
}

/**
 * SectionHeader — unified header for grouped admin panels. Provides one
 * consistent typographic rhythm and a clear "Admin only" affordance.
 */
export function SectionHeader({
  icon,
  title,
  eyebrow,
  right,
  adminOnly,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-2", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-primary shrink-0">{icon}</span>}
          <h3 className="font-semibold text-sm truncate">{title}</h3>
          {adminOnly && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 font-medium uppercase tracking-wide shrink-0"
            >
              Admin
            </Badge>
          )}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
