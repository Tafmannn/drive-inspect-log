import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useSectionReveal } from "../hooks/useSectionReveal";

interface MarketingSectionProps {
  children: ReactNode;
  id?: string;
  tone?: "light" | "muted" | "dark" | "navy";
  className?: string;
  /** aria-labelledby target id for the section landmark. */
  labelledBy?: string;
}

const toneClasses: Record<NonNullable<MarketingSectionProps["tone"]>, string> = {
  light: "bg-white text-marketing-text",
  muted: "bg-marketing-bg-light text-marketing-text",
  dark: "bg-marketing-bg-dark text-marketing-on-dark",
  navy: "bg-marketing-navy text-marketing-on-dark",
};

/**
 * Consistent vertical rhythm + scroll-reveal container for marketing sections.
 * Children marked with `data-reveal` animate in when the section enters view.
 */
export function MarketingSection({
  children,
  id,
  tone = "light",
  className,
  labelledBy,
}: MarketingSectionProps) {
  const ref = useSectionReveal<HTMLElement>();
  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={labelledBy}
      className={cn("py-16 sm:py-20 lg:py-24", toneClasses[tone], className)}
    >
      <div className="mx-auto max-w-content px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}
