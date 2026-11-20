import { useEffect } from "react";

/** Sets the browser tab title, e.g. "LK24 HXP · Vehicle moves · Axentra". */
export function usePortalTitle(...parts: (string | null | undefined)[]): void {
  const title = parts.filter(Boolean).join(" · ");
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
