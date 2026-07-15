import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Simple readable prose column for content-heavy pages (legal, about sections).
 * Applies consistent heading/paragraph/list styling without a plugin.
 */
export function ContentProse({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-3xl space-y-4 text-[1.02rem] leading-relaxed text-marketing-text-secondary",
        "[&_h2]:mt-10 [&_h2]:font-heading [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-marketing-text",
        "[&_h3]:mt-6 [&_h3]:font-heading [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-marketing-text",
        "[&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_ul]:marker:text-marketing-primary",
        "[&_a]:font-medium [&_a]:text-marketing-primary [&_a]:underline",
        "[&_strong]:text-marketing-text",
        className,
      )}
    >
      {children}
    </div>
  );
}
