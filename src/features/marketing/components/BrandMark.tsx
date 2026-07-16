import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  /** Accent colour for the arrowhead. Defaults to the marketing electric blue. */
  accent?: string;
  title?: string;
}

/**
 * Axentra logo mark, rebuilt as a crisp, resolution-independent SVG so it stays
 * razor-sharp at any size and themes to any background (uses currentColor for
 * the ring + road lines, with a blue arrowhead). Echoes the real brand mark:
 * an open ring, three road lines converging forward, and a precision arrowhead
 * — "precision in every move".
 */
export function BrandMark({ className, accent = "hsl(var(--marketing-electric))", title }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("h-8 w-8", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      {/* open ring (gap on the right where the movement exits) */}
      <path
        d="M45 12 A24 24 0 1 0 53 27"
        stroke="currentColor"
        strokeWidth="4.5"
      />
      {/* three road lines converging forward to the arrow point */}
      <path d="M14 20 L39 32" stroke="currentColor" strokeWidth="4" opacity="0.8" />
      <path d="M12 32 L39 32" stroke="currentColor" strokeWidth="4.5" />
      <path d="M14 44 L39 32" stroke="currentColor" strokeWidth="4" opacity="0.8" />
      {/* precision arrowhead */}
      <path d="M36 22 L52 32 L36 42" stroke={accent} strokeWidth="4.5" />
    </svg>
  );
}
