import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * AdvisoryNote — small italic footer for "advisory only" / disclaimer copy.
 * Keeps language consistent across pricing, evidence and POD surfaces.
 */
export function AdvisoryNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-[10px] text-muted-foreground italic leading-snug", className)}>
      {children}
    </p>
  );
}
