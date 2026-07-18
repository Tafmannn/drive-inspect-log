import { useEffect, useRef, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";

/**
 * App-wide connectivity indicator.
 *
 * The app already handles offline *actions* well (inspections queue, uploads
 * retry) — but nothing told the driver they were offline in the first place,
 * so a dropped signal looked like a broken app. This slim top strip makes the
 * state ambient:
 *   - while offline: a persistent amber bar reassuring that work is saved and
 *     will sync on reconnect;
 *   - on reconnect: a brief green "Back online" confirmation, shown only if we
 *     were actually offline (never on a normal cold start), then it hides.
 *
 * Rendered once at the app root, fixed to the very top above the sticky header.
 * It only occupies space while visible, so it never affects layout otherwise.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowReconnected(false);
      return;
    }
    // Back online — only celebrate if we had actually dropped.
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 3000);
      return () => clearTimeout(t);
    }
  }, [online]);

  if (online && !showReconnected) return null;

  const offline = !online;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-2 px-4 py-1.5 text-[13px] font-medium text-white pt-[calc(env(safe-area-inset-top)+0.375rem)]",
        offline ? "bg-warning" : "bg-success",
      )}
    >
      {offline ? (
        <>
          <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>You're offline — your work is saved and will sync when you reconnect.</span>
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Back online — syncing your changes.</span>
        </>
      )}
    </div>
  );
}
