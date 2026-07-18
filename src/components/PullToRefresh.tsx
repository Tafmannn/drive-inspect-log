import { useRef, useState, type ReactNode, type TouchEvent } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TRIGGER_DISTANCE = 70; // px pulled before a release triggers a refresh
const MAX_PULL = 100; // clamp so the indicator never travels off-screen
const RESISTANCE = 0.5; // finger travel → indicator travel, for a natural drag

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
  /** Disable on desktop / when a list has its own scroll container. */
  disabled?: boolean;
}

/**
 * Pull-to-refresh for the mobile lists, matching the gesture people bring from
 * every native app. Only engages when the page is scrolled to the very top and
 * the gesture is a deliberate downward drag, so it never fights normal
 * scrolling. `onRefresh` is awaited; the spinner shows until it settles.
 */
export function PullToRefresh({ onRefresh, children, disabled }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  const onTouchStart = (e: TouchEvent) => {
    if (disabled || refreshing) return;
    // Only arm the gesture at the top of the page — otherwise this is a scroll.
    if (window.scrollY > 0) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    setPull(Math.min(delta * RESISTANCE, MAX_PULL));
  };

  const onTouchEnd = async () => {
    if (startY.current === null || refreshing) return;
    startY.current = null;
    if (pull >= TRIGGER_DISTANCE) {
      setRefreshing(true);
      setPull(TRIGGER_DISTANCE);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  const active = pull > 0 || refreshing;
  const ready = pull >= TRIGGER_DISTANCE;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="flex items-center justify-center overflow-hidden text-muted-foreground"
        style={{
          height: active ? pull : 0,
          transition: startY.current === null ? "height 0.2s ease" : undefined,
        }}
        aria-hidden={!active}
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
      {children}
    </div>
  );
}
