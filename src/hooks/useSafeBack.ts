import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Safe back navigation with fallback.
 *
 * Uses `navigate(-1)` when there is genuine browser history within the app,
 * otherwise falls back to the provided default route.
 *
 * `window.history.length > 1` is checked, but since browsers start at 1 or 2
 * depending on implementation, we use a threshold of 2 to be safe.
 * Additionally, if `document.referrer` is empty (direct deep link / new tab),
 * we always use the fallback.
 */
export function useSafeBack(fallback: string) {
  const navigate = useNavigate();

  return useCallback(() => {
    // Deep link or new tab — no meaningful history to go back to
    const hasHistory =
      window.history.length > 2 ||
      (window.history.length > 1 && document.referrer !== "");

    if (hasHistory) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  }, [navigate, fallback]);
}
