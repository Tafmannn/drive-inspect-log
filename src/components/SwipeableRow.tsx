import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hapticTick } from "@/lib/haptics";

export interface SwipeAction {
  label: string;
  icon: ReactNode;
  onAction: () => void;
  className?: string;
}

interface SwipeableRowProps {
  actions: SwipeAction[];
  children: ReactNode;
  className?: string;
}

const ACTION_WIDTH = 72;
const DRAG_THRESHOLD = 6;

export function SwipeableRow({ actions, children, className }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const axis = useRef<"none" | "x" | "y">("none");
  const revealed = useRef(false);
  const pointerId = useRef<number | null>(null);
  // Browsers fire a native `click` right after pointerup/mouseup even when
  // that pointerup ended a real drag (mouse "click" isn't suppressed by
  // movement distance the way touch is). Without this flag that residual
  // click gets misread by onClickCapture below as an intentional tap,
  // immediately closing the panel this same gesture just opened.
  const justDragged = useRef(false);

  const maxOffset = actions.length * ACTION_WIDTH;

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerId.current = e.pointerId;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startOffset.current = offset;
    axis.current = "none";
    revealed.current = offset > maxOffset / 2;
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (axis.current === "none") {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "x") {
        setDragging(true);
        const target = e.target as HTMLElement;
        target.setPointerCapture?.(e.pointerId);
      }
    }
    if (axis.current !== "x") return;

    e.preventDefault();
    // Slight elastic overshoot past maxOffset for a native-feeling drag.
    const next = Math.max(0, Math.min(maxOffset + 24, startOffset.current - dx));
    setOffset(next);

    const nowRevealed = next > maxOffset / 2;
    if (nowRevealed !== revealed.current) {
      hapticTick();
      revealed.current = nowRevealed;
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setDragging(false);
    if (axis.current === "x") {
      justDragged.current = true;
      // Functional update — a fast swipe can fire pointerup before the
      // pointermove-triggered re-render has committed, so reading the
      // `offset` state variable directly here can see a stale value.
      setOffset((prev) => (prev > maxOffset / 2 ? maxOffset : 0));
    }
    axis.current = "none";
  };

  return (
    <div className={cn("relative rounded-lg overflow-hidden", className)}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: maxOffset }}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => {
              setOffset(0);
              action.onAction();
            }}
            style={{ width: ACTION_WIDTH }}
            className={cn(
              "h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-white",
              action.className
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          // Swallow the browser's residual click from the drag that just
          // ended — it's not a real tap and must not reach the child or
          // fall through to the "tap while revealed" branch below.
          if (justDragged.current) {
            justDragged.current = false;
            e.stopPropagation();
            e.preventDefault();
            return;
          }
          // A genuine tap while actions are revealed closes them instead
          // of triggering whatever onClick the row content itself has.
          if (offset > 0) {
            e.stopPropagation();
            e.preventDefault();
            setOffset(0);
          }
        }}
        style={{
          transform: `translateX(${-offset}px)`,
          transition: dragging ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y",
        }}
        className="relative bg-background"
      >
        {children}
      </div>
    </div>
  );
}
