import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { resolveBackTarget } from "@/lib/navigationUtils";

/**
 * Safe back navigation with fallback.
 *
 * When `searchParams` carries a recognised `?from=` (see resolveBackTarget's
 * allow-list), that takes priority — this is how pages linked from the
 * Control Centre (?from=/control/jobs, etc.) return there instead of the
 * driver-facing list, regardless of what the browser's own history looks
 * like (new tab, deep link, multi-hop navigation).
 *
 * Otherwise uses `navigate(-1)` when there is genuine browser history within
 * the app, falling back to the provided default route.
 *
 * `window.history.length > 1` is checked, but since browsers start at 1 or 2
 * depending on implementation, we use a threshold of 2 to be safe.
 * Additionally, if `document.referrer` is empty (direct deep link / new tab),
 * we always use the fallback.
 */
export function useSafeBack(fallback: string, searchParams?: URLSearchParams) {
  const navigate = useNavigate();

  return useCallback(() => {
    if (searchParams) {
      const fromTarget = resolveBackTarget(searchParams, fallback);
      if (fromTarget !== fallback) {
        navigate(fromTarget);
        return;
      }
    }

    // Deep link or new tab — no meaningful history to go back to
    const hasHistory =
      window.history.length > 2 ||
      (window.history.length > 1 && document.referrer !== "");

    if (hasHistory) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  }, [navigate, fallback, searchParams]);
}
