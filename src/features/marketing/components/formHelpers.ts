/** Non-component form helpers (kept out of the component file for HMR). */

export const fieldInputClass =
  "w-full rounded-lg border border-marketing-border bg-white px-3.5 py-2.5 text-[16px] text-marketing-text shadow-sm outline-none transition-colors placeholder:text-marketing-text-muted focus:border-marketing-primary focus:ring-2 focus:ring-marketing-primary/20 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20";

/** Describedby id list for wiring a control to its hint + error. */
export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}
