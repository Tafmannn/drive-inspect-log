import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";

interface BrandLogoProps {
  /** Render for placement on a dark background (default) or light. */
  tone?: "dark" | "light";
  /** Show the "Precision in every move" tagline beneath the wordmark. */
  withTagline?: boolean;
  className?: string;
}

/**
 * Axentra brand lockup: the crisp SVG mark + AXENTRA wordmark, optionally with
 * the tagline. currentColor drives the mark + wordmark so it themes cleanly on
 * dark (white) or light (navy) surfaces.
 */
export function BrandLogo({ tone = "dark", withTagline = false, className }: BrandLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5",
        tone === "dark" ? "text-white" : "text-marketing-navy",
        className,
      )}
    >
      <BrandMark className="h-9 w-9 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="font-heading text-[1.35rem] font-extrabold uppercase tracking-[0.14em]">
          Axentra
        </span>
        {withTagline && (
          <span
            className={cn(
              "mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.28em]",
              tone === "dark" ? "text-marketing-on-dark-muted" : "text-marketing-text-muted",
            )}
          >
            Precision in every move
          </span>
        )}
      </span>
    </span>
  );
}
