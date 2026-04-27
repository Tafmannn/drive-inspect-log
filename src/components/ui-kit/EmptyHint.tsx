import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * EmptyHint — minimal inline empty-state copy for sections that don't need
 * a full empty-state illustration.
 */
export function EmptyHint({
  icon,
  children,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground py-2",
        className,
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}
