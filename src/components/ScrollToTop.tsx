import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Scroll behaviour on client-side navigation, for both kinds of page:
 *  - document pages (driver app, admin, portal) scroll the window;
 *  - the Command Center scrolls its own `<main data-scroll-root>`.
 *
 * PUSH/REPLACE → start the new page at the top (BrowserRouter keeps the old
 * offset otherwise, so opening a job from halfway down a list rendered the job
 * halfway down).
 * POP (Back/Forward) → return to where that page was left. The browser does
 * this for the window, but not reliably when the page renders after the
 * popstate event, and never for an inner scroller — so positions are recorded
 * per history entry and re-applied here.
 */

const SETTLE_MS = 1000; // give up after this long
const SETTLE_FRAMES = 6; // position must hold this many frames in a row

function getScrollRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-scroll-root]");
}

export function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, { win: number; root: number }>());
  const currentKey = useRef(location.key);

  // Record positions for the entry being viewed. Capture phase on document
  // catches scrolls of any element (scroll events don't bubble).
  useEffect(() => {
    const record = (e: Event) => {
      const prev = positions.current.get(currentKey.current) ?? { win: 0, root: 0 };
      const t = e.target;
      if (t === document || t === document.documentElement) {
        prev.win = window.scrollY;
      } else if (t instanceof HTMLElement && t.hasAttribute("data-scroll-root")) {
        prev.root = t.scrollTop;
      } else {
        return;
      }
      positions.current.set(currentKey.current, prev);
    };
    document.addEventListener("scroll", record, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", record, { capture: true });
  }, []);

  useLayoutEffect(() => {
    currentKey.current = location.key;

    // PUSH/REPLACE → top. POP → the recorded position (or leave the browser's
    // own restoration alone if we never saw this entry).
    const target =
      navigationType === "POP" ? positions.current.get(location.key) : { win: 0, root: 0 };
    if (!target) return;

    // The new page may not be laid out yet: a lazy route shows the Suspense
    // fallback (hiding the old tree, where scrollTop writes are ignored), and
    // list data can arrive a frame later. Keep the target applied until it has
    // held on a visible page for a few frames, the time runs out, or the user
    // touches/scrolls — never fight a finger.
    let cancelled = false;
    const stop = () => { cancelled = true; };
    const opts = { passive: true, capture: true } as const;
    window.addEventListener("touchstart", stop, opts);
    window.addEventListener("wheel", stop, opts);
    const started = performance.now();
    let held = 0;
    let frame = 0;
    const apply = () => {
      if (cancelled) return;
      let ok = true;
      if (Math.abs(window.scrollY - target.win) > 1) {
        window.scrollTo({ top: target.win, left: 0, behavior: "auto" });
        ok = false;
      }
      const root = getScrollRoot();
      if (root) {
        if (root.clientHeight === 0) ok = false; // hidden behind Suspense
        else if (Math.abs(root.scrollTop - target.root) > 1) {
          root.scrollTop = target.root;
          ok = false;
        }
      }
      held = ok ? held + 1 : 0;
      if (held < SETTLE_FRAMES && performance.now() - started < SETTLE_MS) {
        frame = requestAnimationFrame(apply);
      }
    };
    apply();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("touchstart", stop, opts);
      window.removeEventListener("wheel", stop, opts);
    };
  }, [location.key, navigationType]);

  return null;
}
