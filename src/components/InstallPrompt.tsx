import { useEffect, useState } from "react";
import { Share, SquarePlus, Smartphone, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "install-prompt-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Captured at module scope: Chrome fires beforeinstallprompt very early
// (often before React mounts), so a component-level listener would miss it.
let deferredInstallEvent: BeforeInstallPromptEvent | null = null;
let capturedListeners: Array<() => void> = [];
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallEvent = e as BeforeInstallPromptEvent;
    capturedListeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallEvent = null;
    capturedListeners.forEach((fn) => fn());
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    // iOS Safari's non-standard flag when launched from the Home Screen.
    (navigator as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod/.test(navigator.userAgent)
  );
}

/**
 * One-time "add Axentra to your Home Screen" card, shown only when the app
 * is running in a browser tab. Installing matters here: notifications on
 * iPhone ONLY work from the installed app, and the installed app opens
 * instantly with no signal. Android/Chromium gets the real install prompt
 * via beforeinstallprompt; iOS has no API, so it gets the two-step Share →
 * Add to Home Screen instruction instead.
 */
export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1",
  );
  const [, forceRender] = useState(0);

  useEffect(() => {
    const bump = () => forceRender((n) => n + 1);
    capturedListeners.push(bump);
    return () => {
      capturedListeners = capturedListeners.filter((fn) => fn !== bump);
    };
  }, []);

  if (dismissed || isStandalone()) return null;

  const ios = isIos();
  const canNativeInstall = deferredInstallEvent !== null;
  // Nothing actionable to show (e.g. desktop Firefox): stay quiet.
  if (!ios && !canNativeInstall) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode — dismiss for this session only.
    }
    setDismissed(true);
  };

  const install = async () => {
    const ev = deferredInstallEvent;
    if (!ev) return;
    deferredInstallEvent = null;
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch {
      // User dismissed the native sheet — leave our card up.
    }
    forceRender((n) => n + 1);
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Add Axentra to your Home Screen</p>
            <p className="text-xs text-muted-foreground">
              Get job notifications and open the app instantly — even with no
              signal.
            </p>
          </div>
        </div>

        {ios ? (
          <ol className="space-y-1.5 text-xs text-muted-foreground pl-1">
            <li className="flex items-center gap-2">
              <span className="font-semibold text-foreground">1.</span>
              Tap the <Share className="inline h-3.5 w-3.5 text-primary" aria-label="Share" /> Share
              button in Safari
            </li>
            <li className="flex items-center gap-2">
              <span className="font-semibold text-foreground">2.</span>
              Choose{" "}
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <SquarePlus className="h-3.5 w-3.5" /> Add to Home Screen
              </span>
            </li>
          </ol>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
          {canNativeInstall && (
            <Button size="sm" onClick={() => void install()}>
              <Download className="h-4 w-4 mr-1.5" /> Install app
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
