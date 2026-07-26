import { useRegisterSW } from "virtual:pwa-register/react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

/**
 * Non-blocking "new version ready" banner. The service worker registers with
 * registerType "prompt", so nothing updates until the user chooses to — and
 * this banner additionally stays hidden during an active inspection so a
 * driver is never interrupted mid-walk-around. "Later" dismisses it for the
 * session; the same update is offered again on the next app start.
 */
export function UpdatePrompt() {
  const location = useLocation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const inInspection = location.pathname.startsWith("/inspection");
  if (!needRefresh || inInspection) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 inset-x-4 z-50 max-w-lg mx-auto rounded-xl border border-border bg-card shadow-lg p-3 flex items-center gap-3"
    >
      <RefreshCw className="h-5 w-5 text-primary shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Update available</p>
        <p className="text-xs text-muted-foreground">
          A new version of Axentra is ready.
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Update
      </Button>
    </div>
  );
}
