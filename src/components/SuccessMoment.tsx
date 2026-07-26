import { useEffect, useRef } from "react";
import { Check, CloudUpload } from "lucide-react";
import { hapticSuccess } from "@/lib/haptics";

export type SuccessMomentVariant =
  | "completed"
  | "saved-offline"
  | "delivery-completed";

const COPY: Record<
  SuccessMomentVariant,
  { title: string; message: string; delay: number }
> = {
  completed: {
    title: "Inspection completed",
    message: "The inspection has been submitted.",
    delay: 600,
  },
  "delivery-completed": {
    title: "Delivery completed",
    message: "The job has been completed successfully.",
    delay: 700,
  },
  // Longer hold: this wording matters and must not read as "submitted".
  "saved-offline": {
    title: "Saved on this device",
    message:
      "Your inspection is safely stored and will submit automatically when you're back online.",
    delay: 900,
  },
};

/**
 * Brief full-screen confirmation for genuine milestones (inspection
 * submitted, delivery done, durable offline save). Purely presentational:
 * it renders AFTER the action has already succeeded and calls onDone exactly
 * once so the caller can run its existing navigation. Reduced-motion users
 * get a static (no zoom/fade) version with the same short hold.
 */
export function SuccessMoment({
  variant,
  onDone,
}: {
  variant: SuccessMomentVariant;
  onDone: () => void;
}) {
  const firedRef = useRef(false);
  const { title, message, delay } = COPY[variant];

  useEffect(() => {
    // Guard against Strict-Mode double-invoke and re-renders: one haptic,
    // one onDone, ever.
    if (!firedRef.current) hapticSuccess();
    const t = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onDone();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const Icon = variant === "saved-offline" ? CloudUpload : Check;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm px-8 text-center" +
        (reduced ? "" : " animate-in fade-in duration-150")
      }
    >
      <div
        className={
          "flex h-20 w-20 items-center justify-center rounded-full " +
          (variant === "saved-offline"
            ? "bg-warning/15 text-warning"
            : "bg-success/15 text-success") +
          (reduced ? "" : " animate-in zoom-in-50 duration-300")
        }
      >
        <Icon className="h-10 w-10" strokeWidth={2.5} />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      </div>
    </div>
  );
}
