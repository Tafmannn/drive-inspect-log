import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Animates a number toward `value` (~400ms ease-out). The FIRST render shows
 * the value immediately — the count-up only runs on later changes, so a query
 * refetch ticks from the previous figure rather than restarting from zero.
 * Non-finite values and reduced-motion users get the final value instantly.
 * Consumers keep responsibility for formatting (and for exposing the final
 * value to assistive technology — see AnimatedNumber).
 */
export function useCountUp(value: number, duration = 400): number {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>();

  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = value;

    if (
      from === value ||
      !Number.isFinite(value) ||
      !Number.isFinite(from) ||
      prefersReducedMotion() ||
      typeof requestAnimationFrame !== "function"
    ) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return display;
}
