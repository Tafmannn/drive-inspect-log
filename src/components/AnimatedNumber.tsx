import { useCountUp } from "@/hooks/useCountUp";

/**
 * Integer count-up display. The animated frames are decorative — the real,
 * final value is exposed immediately via aria-label so screen readers never
 * hear an in-between number.
 */
export function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const display = useCountUp(value);
  return (
    <span className={className} aria-label={String(value)}>
      <span aria-hidden="true">{Math.round(display)}</span>
    </span>
  );
}
