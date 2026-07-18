import { useEffect, useState } from "react";

/**
 * Tracks the browser's online/offline state.
 *
 * `navigator.onLine` is the initial value and the `online`/`offline` window
 * events drive updates. This is deliberately the *browser's* notion of
 * connectivity (has a network route), which is the right signal for a global
 * "you're offline" indicator — it flips the instant the OS loses/regains a
 * connection, without waiting for a request to fail. Per-request failures are
 * still handled where they happen (submit queue, upload retries); this hook
 * only powers the ambient banner/toasts.
 *
 * SSR-safe: assumes online when `navigator` is unavailable so nothing renders
 * an offline state during a non-browser render.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    // Re-sync in case the state changed between initial render and effect.
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
