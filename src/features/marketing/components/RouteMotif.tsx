import { cn } from "@/lib/utils";

/**
 * Decorative collection → delivery route line with evidence checkpoints.
 * Purely presentational; hidden from assistive technology.
 */
export function RouteMotif({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 120"
      fill="none"
      role="presentation"
      aria-hidden="true"
      className={cn("h-auto w-full", className)}
    >
      <path
        d="M40 80 C 160 20, 260 20, 300 60 S 460 100, 560 40"
        stroke="hsl(var(--marketing-electric))"
        strokeWidth="2.5"
        strokeDasharray="2 10"
        strokeLinecap="round"
        opacity="0.7"
      />
      {/* checkpoints */}
      {[
        { cx: 175, cy: 33 },
        { cx: 300, cy: 60 },
        { cx: 430, cy: 78 },
      ].map((p) => (
        <circle key={`${p.cx}`} cx={p.cx} cy={p.cy} r="4" fill="hsl(var(--marketing-electric))" opacity="0.85" />
      ))}
      {/* collection origin */}
      <circle cx="40" cy="80" r="9" fill="hsl(var(--marketing-primary))" />
      <circle cx="40" cy="80" r="9" stroke="white" strokeWidth="2" opacity="0.5" />
      {/* delivery destination */}
      <circle cx="560" cy="40" r="9" fill="hsl(var(--marketing-success))" />
      <circle cx="560" cy="40" r="9" stroke="white" strokeWidth="2" opacity="0.5" />
    </svg>
  );
}
