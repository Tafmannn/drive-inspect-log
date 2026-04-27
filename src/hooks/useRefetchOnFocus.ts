/**
 * useRefetchOnFocus — refresh a set of TanStack Query keys whenever the
 * user returns to the tab/window.
 *
 * Why: mobile browsers (especially iOS Safari/Chrome) aggressively retain
 * in-memory React state when the user navigates away and back (bfcache,
 * "swipe back" gesture, app-switcher resume). TanStack's default focus
 * refetch only triggers on `window` focus, which iOS Safari often does
 * NOT fire on bfcache restore. We additionally listen to `pageshow` and
 * `visibilitychange` so the Admin dashboard always re-derives queue
 * counts from fresh server state on return.
 *
 * The hook is intentionally lightweight — call sites pass the exact keys
 * they care about so we don't blanket-refetch unrelated domains.
 */
import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

const isDev =
  typeof import.meta !== "undefined" &&
  (import.meta as { env?: { DEV?: boolean } })?.env?.DEV === true;

export function useRefetchOnFocus(keys: QueryKey[]) {
  const qc = useQueryClient();

  useEffect(() => {
    const refetch = (reason: string) => {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.debug(
          `[useRefetchOnFocus] ${reason} → refetching ${keys.length} key(s)`,
        );
      }
      for (const key of keys) {
        qc.invalidateQueries({ queryKey: key });
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refetch("visibilitychange");
    };
    const onFocus = () => refetch("focus");
    const onPageShow = (e: PageTransitionEvent) => {
      // `persisted` = restored from bfcache — exactly the mobile back-nav case.
      if (e.persisted) refetch("pageshow(bfcache)");
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
    // Keys are intentionally captured by reference — stable arrays passed
    // by the caller. Re-running on every render would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);
}
