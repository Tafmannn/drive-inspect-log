import { useEffect, useState } from "react";

/**
 * True at the Control layout's desktop breakpoint (Tailwind `lg`, 1024px),
 * where the sidebar is shown and dense tables fit. Below it, screens use
 * touch-friendly cards. Defaults to false (cards) when matchMedia is missing.
 */
export const DESKTOP_QUERY = "(min-width: 1024px)";

function matches(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DESKTOP_QUERY).matches
    : false;
}

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState<boolean>(matches);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return desktop;
}
