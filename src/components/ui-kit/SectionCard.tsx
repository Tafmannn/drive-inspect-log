import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * SectionCard — consistent rounded-lg bordered surface used across admin
 * panels. Replaces ad-hoc `rounded-lg border border-border p-4 space-y-3`.
 */
export const SectionCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground p-4 space-y-3 shadow-[var(--shadow-card)]",
        className,
      )}
      {...rest}
    />
  ),
);
SectionCard.displayName = "SectionCard";
