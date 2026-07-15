import type { ReactNode } from "react";

/** Visually hidden but available to assistive technology (sr-only equivalent). */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
