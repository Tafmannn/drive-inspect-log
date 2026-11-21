import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { getAllPendingUploads } from "@/lib/pendingUploads";
import { isUpdateHeldOn } from "@/lib/updatePolicy";

/**
 * Non-blocking "new version ready" banner. The service worker registers with
 * registerType "prompt", so nothing updates until the user chooses to.
 * - Hidden on routes with unsaved work (see HOLD_ROUTES).
 * - "Update" refuses to reload while a photo/signature upload is in flight,
 *   and says so, rather than interrupting it.
 * - "Later" dismisses it for the session; the update is offered again on the
 *   next app start.
 * - While visible it reserves scroll space (--update-prompt-space on <html>,
 *   used by #root's bottom padding) so it never permanently covers content.
 */
export function UpdatePrompt() {
  const location = useLocation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const visible = needRefresh && !isUpdateHeldOn(location.pathname);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!visible || !boxRef.current) {
      root.style.removeProperty("--update-prompt-space");
      return;
    }
    const set = () => root.style.setProperty("--update-prompt-space", `${(boxRef.current?.offsetHeight ?? 0) + 16}px`);
    set();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    ro?.observe(boxRef.current);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--update-prompt-space");
    };
  }, [visible, blockedReason]);

  useEffect(() => setBlockedReason(null), [location.pathname]);

  if (!visible) return null;

  const onUpdate = async () => {
    setChecking(true);
    try {
      const uploading = (await getAllPendingUploads()).some((u) => u.status === "uploading");
      if (uploading) {
        setBlockedReason("An upload is in progress. Update once it has finished.");
        return;
      }
    } catch {
      // If the queue can't be read, err on the side of not reloading.
      setBlockedReason("Couldn't check pending uploads. Try again in a moment.");
      return;
    } finally {
      setChecking(false);
    }
    void updateServiceWorker(true);
  };

  return (
    <div
      ref={boxRef}
      role="status"
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] inset-x-4 z-50 max-w-lg mx-auto rounded-xl border border-border bg-card shadow-lg p-3 flex items-center gap-3"
    >
      <RefreshCw aria-hidden className="h-5 w-5 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Update available</p>
        <p className="text-xs text-muted-foreground">
          {blockedReason ?? "A new version of Axentra is ready."}
        </p>
      </div>
      <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button size="sm" className="min-h-11" disabled={checking} onClick={() => void onUpdate()}>
        Update
      </Button>
    </div>
  );
}
