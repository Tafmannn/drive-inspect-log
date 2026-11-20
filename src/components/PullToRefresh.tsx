import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TRIGGER_DISTANCE = 70; // px pulled before a release triggers a refresh
const MAX_PULL = 100; // clamp so the indicator never travels off-screen
const RESISTANCE = 0.5; // finger travel → indicator travel, for a natural drag
const SLOP = 8; // px of movement before we decide what the gesture is
const INDICATOR = 36; // indicator diameter (px)

type Phase = "idle" | "undecided" | "pulling" | "ignored";

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
  /** Disable on desktop / when a list has its own scroll container. */
  disabled?: boolean;
}

/**
 * Pull-to-refresh for the mobile lists.
 *
 * The page itself is never moved or resized by this component: native
 * scrolling (and iOS's own rubber-band at the top) stays in charge of the
 * content, so it tracks the finger exactly. Only a small overlaid indicator
 * follows the pull, animated with transform/opacity (no layout per frame).
 *
 * It only arms for a deliberate single-finger downward drag that starts with
 * the page at the very top. A horizontal/diagonal swipe, a second finger
 * (pinch), the page starting to scroll, or the OS cancelling the touch all
 * disarm it without refreshing.
 */
export function PullToRefresh({ onRefresh, children, disabled }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const phase = useRef<Phase>("idle");
  const start = useRef({ x: 0, y: 0 });
  const pullRef = useRef(0);

  const setPullBoth = (v: number) => {
    pullRef.current = v;
    setPull(v);
  };

  const reset = () => {
    phase.current = "idle";
    if (pullRef.current !== 0) setPullBoth(0);
  };

  const onTouchStart = (e: TouchEvent) => {
    if (disabled || refreshing || e.touches.length !== 1 || window.scrollY > 0) {
      phase.current = "ignored";
      return;
    }
    phase.current = "undecided";
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchMove = (e: TouchEvent) => {
    if (phase.current === "idle" || phase.current === "ignored") return;
    if (e.touches.length !== 1 || window.scrollY > 0) {
      // Second finger (pinch) or the page scrolled: this is not a pull.
      phase.current = "ignored";
      if (pullRef.current !== 0) setPullBoth(0);
      return;
    }
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;
    if (phase.current === "undecided") {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      // Must be clearly downward: more vertical than horizontal, by a margin.
      if (dy <= 0 || Math.abs(dx) * 1.5 > dy) {
        phase.current = "ignored";
        return;
      }
      phase.current = "pulling";
    }
    setPullBoth(Math.max(0, Math.min(dy * RESISTANCE, MAX_PULL)));
  };

  // Runs the refresh with the indicator held open. A failed refresh must not
  // become an unhandled rejection: the list keeps its data and shows its own
  // error/offline state, so the indicator simply closes.
  const runRefresh = async () => {
    setRefreshing(true);
    setPullBoth(TRIGGER_DISTANCE);
    try {
      await onRefresh();
    } catch {
      /* surfaced by the list's own error state */
    } finally {
      setRefreshing(false);
      setPullBoth(0);
    }
  };

  // Synchronous on purpose: React ignores a handler's return value, so an
  // async handler here would hand it a promise nobody awaits (Sonar S6544).
  const onTouchEnd = () => {
    const wasPulling = phase.current === "pulling";
    phase.current = "idle";
    if (!wasPulling || refreshing) {
      reset();
      return;
    }
    if (pullRef.current >= TRIGGER_DISTANCE) {
      void runRefresh();
    } else {
      setPullBoth(0);
    }
  };

  const active = pull > 0 || refreshing;
  const ready = pull >= TRIGGER_DISTANCE;
  const tracking = phase.current === "pulling";
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Indicator rests just above the content and slides down with the pull.
  const offset = (refreshing ? TRIGGER_DISTANCE : pull) - INDICATOR;
  // Fades in with the pull; fully visible while refreshing; 0 at rest.
  const indicatorOpacity = refreshing ? 1 : Math.min(1, pull / TRIGGER_DISTANCE);

  return (
    <div
      className="relative"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={reset}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        aria-hidden={!active}
        data-ptr-indicator
        style={{
          transform: `translate3d(0, ${offset}px, 0)`,
          opacity: indicatorOpacity,
          transition: tracking || reduceMotion ? "none" : "transform 200ms ease-out, opacity 200ms ease-out",
        }}
      >
        <div
          className="flex items-center justify-center rounded-full border border-border bg-card shadow-md text-muted-foreground"
          style={{ width: INDICATOR, height: INDICATOR }}
        >
          {refreshing ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <ArrowDown
              className={cn(
                "w-5 h-5 transition-transform",
                ready ? "rotate-180 text-primary" : "rotate-0",
              )}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
