/**
 * Regressions found while reproducing "pages feel wrongly sized / scroll
 * doesn't feel native after rotating an iPhone" (see PR). Each case failed on
 * the base commit:
 *  - pull-to-refresh fired on a diagonal swipe and on a two-finger pinch, and
 *    stayed half-open after the OS cancelled the touch;
 *  - re-opening an inspection in the same tab (iOS reloads backgrounded tabs)
 *    skipped the draft restore, so autosave wiped the driver's notes/step;
 *  - the Command Center's inner scroller kept the previous page's offset on a
 *    new route and lost its own offset on Back;
 *  - signature strokes are scaled to fit, not clipped, when the canvas shrinks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { PullToRefresh } from "@/components/PullToRefresh";
import { decideDraftRestore } from "@/features/inspection/draftRestore";
import { ScrollToTop } from "@/components/ScrollToTop";
import { fitScale } from "@/lib/signatureDraft";

// ── Pull to refresh ─────────────────────────────────────────────────────

type Pt = [number, number];
const touches = (pts: Pt[]) => pts.map(([clientX, clientY], i) => ({ clientX, clientY, identifier: i }));

function gesture(el: Element, path: Pt[][], end: "end" | "cancel" = "end") {
  fireEvent.touchStart(el, { touches: touches(path[0]) });
  for (const p of path.slice(1)) fireEvent.touchMove(el, { touches: touches(p) });
  if (end === "cancel") fireEvent.touchCancel(el, { touches: [] });
  else fireEvent.touchEnd(el, { touches: [] });
}

function renderPtr() {
  const onRefresh = vi.fn(() => Promise.resolve());
  const utils = render(
    <PullToRefresh onRefresh={onRefresh}>
      <div data-testid="list">list</div>
    </PullToRefresh>,
  );
  const surface = utils.getByTestId("list").parentElement!;
  const indicator = utils.container.querySelector("[data-ptr-indicator]") as HTMLElement;
  return { onRefresh, surface, indicator };
}

const straightDown: Pt[][] = Array.from({ length: 12 }, (_, i) => [[200, 100 + i * 20]]);

describe("PullToRefresh gesture classification", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
  });

  it("refreshes on a deliberate downward pull from the top", async () => {
    const { onRefresh, surface } = renderPtr();
    await act(async () => gesture(surface, straightDown));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("ignores a diagonal swipe that starts at the top", async () => {
    const { onRefresh, surface, indicator } = renderPtr();
    const diagonal: Pt[][] = Array.from({ length: 12 }, (_, i) => [[60 + i * 28, 100 + i * 15]]);
    await act(async () => gesture(surface, diagonal));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(indicator.style.opacity).toBe("0");
  });

  it("ignores a two-finger pinch", async () => {
    const { onRefresh, surface } = renderPtr();
    const pinch: Pt[][] = Array.from({ length: 10 }, (_, i) => [[150 - i * 5, 100 + i * 20], [250 + i * 5, 120 + i * 25]]);
    await act(async () => gesture(surface, pinch));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("resets without refreshing when the OS cancels the touch", async () => {
    const { onRefresh, surface, indicator } = renderPtr();
    await act(async () => gesture(surface, straightDown, "cancel"));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(indicator.style.opacity).toBe("0");
  });

  it("does not arm when the page is scrolled", async () => {
    window.scrollY = 400;
    const { onRefresh, surface } = renderPtr();
    await act(async () => gesture(surface, straightDown));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("disarms if the page starts scrolling mid-gesture", async () => {
    const { onRefresh, surface } = renderPtr();
    await act(async () => {
      fireEvent.touchStart(surface, { touches: touches([[200, 100]]) });
      fireEvent.touchMove(surface, { touches: touches([[200, 140]]) });
      window.scrollY = 50;
      for (let i = 2; i < 12; i++) fireEvent.touchMove(surface, { touches: touches([[200, 100 + i * 20]]) });
      fireEvent.touchEnd(surface, { touches: [] });
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("holds the indicator open while refreshing, then closes it", async () => {
    let finish!: () => void;
    const onRefresh = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    const utils = render(<PullToRefresh onRefresh={onRefresh}><div data-testid="list" /></PullToRefresh>);
    const surface = utils.getByTestId("list").parentElement!;
    const indicator = utils.container.querySelector("[data-ptr-indicator]") as HTMLElement;
    await act(async () => gesture(surface, straightDown));
    expect(indicator.style.opacity).toBe("1");
    expect(indicator.querySelector(".animate-spin")).not.toBeNull();
    // A second pull while refreshing must not start another refresh.
    await act(async () => gesture(surface, straightDown));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(indicator.style.opacity).toBe("0");
  });

  it("closes cleanly when the refresh fails (no unhandled rejection)", async () => {
    const onRefresh = vi.fn(() => Promise.reject(new Error("offline")));
    const utils = render(<PullToRefresh onRefresh={onRefresh}><div data-testid="list" /></PullToRefresh>);
    const surface = utils.getByTestId("list").parentElement!;
    const indicator = utils.container.querySelector("[data-ptr-indicator]") as HTMLElement;
    await act(async () => gesture(surface, straightDown));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(indicator.style.opacity).toBe("0");
  });

  it("does not refresh on a short pull released before the threshold", async () => {
    const { onRefresh, surface, indicator } = renderPtr();
    await act(async () => gesture(surface, [[[200, 100]], [[200, 130]], [[200, 160]]]));
    expect(onRefresh).not.toHaveBeenCalled();
    expect(indicator.style.opacity).toBe("0");
  });

  it("ignores an upward swipe and does nothing when disabled", async () => {
    const { onRefresh, surface } = renderPtr();
    await act(async () => gesture(surface, Array.from({ length: 8 }, (_, i) => [[200, 400 - i * 30]] as Pt[])));
    expect(onRefresh).not.toHaveBeenCalled();

    const disabledRefresh = vi.fn(() => Promise.resolve());
    const utils = render(<PullToRefresh disabled onRefresh={disabledRefresh}><div data-testid="off" /></PullToRefresh>);
    await act(async () => gesture(utils.getByTestId("off").parentElement!, straightDown));
    expect(disabledRefresh).not.toHaveBeenCalled();
  });
});

// ── Inspection draft restore ────────────────────────────────────────────

describe("decideDraftRestore", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const old = { data: { notes: "Scuff nearside", _currentStep: 2 }, savedAt: "2026-11-20T11:00:00Z" };

  it("restores silently on a same-session remount (was: skipped → notes wiped)", () => {
    expect(decideDraftRestore({ draft: old, sessionActive: true, resumedAfterRestart: false, now })).toBe("silent");
  });

  it("restores a same-session draft even with only step/photos progress", () => {
    const thin = { data: { notes: "", _currentStep: 4 }, savedAt: "2026-11-20T11:00:00Z" };
    expect(decideDraftRestore({ draft: thin, sessionActive: true, resumedAfterRestart: false, now })).toBe("silent");
  });

  it("asks before resuming an earlier session's draft", () => {
    expect(decideDraftRestore({ draft: old, sessionActive: false, resumedAfterRestart: false, now })).toBe("prompt");
  });

  it("restores silently after an OS restart we resumed, or a just-saved draft", () => {
    expect(decideDraftRestore({ draft: old, sessionActive: false, resumedAfterRestart: true, now })).toBe("silent");
    const recent = { ...old, savedAt: new Date(now - 3000).toISOString() };
    expect(decideDraftRestore({ draft: recent, sessionActive: false, resumedAfterRestart: false, now })).toBe("silent");
  });

  it("starts fresh with no draft or an empty one", () => {
    expect(decideDraftRestore({ draft: null, sessionActive: true, resumedAfterRestart: false, now })).toBe("fresh");
    const empty = { data: { notes: "", odometer: "" }, savedAt: old.savedAt };
    expect(decideDraftRestore({ draft: empty, sessionActive: false, resumedAfterRestart: false, now })).toBe("fresh");
  });

  it("treats a draft with no saved time as old (asks first)", () => {
    expect(decideDraftRestore({ draft: { data: { notes: "x" } }, sessionActive: false, resumedAfterRestart: false, now })).toBe("prompt");
  });
});

// ── Command Center inner scroller across navigation ─────────────────────

function Shell() {
  const navigate = useNavigate();
  return (
    <main data-scroll-root data-testid="main">
      <button onClick={() => navigate("/control/jobs")}>push</button>
      <button onClick={() => navigate(-1)}>back</button>
    </main>
  );
}

describe("ScrollToTop with an inner scroll root", () => {
  beforeEach(() => {
    // jsdom has no layout: give the scroller a visible height and stub
    // window.scrollTo so only the inner element is under test.
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return this.hasAttribute?.("data-scroll-root") ? 600 : 0; } });
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    frames.length = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { frames.push(cb); return frames.length; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  const frames: FrameRequestCallback[] = [];
  const flushFrames = (n = 20) => {
    for (let i = 0; i < n && frames.length; i++) frames.shift()!(performance.now());
  };

  it("starts a pushed page at the top and restores the offset on Back", async () => {
    const utils = render(
      <MemoryRouter initialEntries={["/control"]}>
        <ScrollToTop />
        <Routes>
          <Route path="/control/*" element={<Shell />} />
        </Routes>
      </MemoryRouter>,
    );
    const main = utils.getByTestId("main");
    main.scrollTop = 900;
    fireEvent.scroll(main);

    // The previous page's offset would otherwise survive (the bug); write it
    // back mid-settle to mimic the browser revealing the old scroll offset.
    await act(async () => { fireEvent.click(utils.getByText("push")); });
    main.scrollTop = 471;
    flushFrames();
    expect(main.scrollTop).toBe(0);

    await act(async () => { fireEvent.click(utils.getByText("back")); });
    flushFrames();
    expect(main.scrollTop).toBe(900);
  });

  function renderShell() {
    return render(
      <MemoryRouter initialEntries={["/control"]}>
        <ScrollToTop />
        <Routes>
          <Route path="/control/*" element={<Shell />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("restores the window offset on Back for document-scrolled pages", async () => {
    const utils = renderShell();
    Object.defineProperty(window, "scrollY", { value: 1200, configurable: true, writable: true });
    fireEvent.scroll(document);
    // Scrolls of unrelated elements are not recorded as the page position.
    const other = document.createElement("div");
    document.body.appendChild(other);
    fireEvent.scroll(other);

    await act(async () => { fireEvent.click(utils.getByText("push")); });
    flushFrames();
    window.scrollY = 0;
    vi.mocked(window.scrollTo).mockClear();

    await act(async () => { fireEvent.click(utils.getByText("back")); });
    flushFrames(1);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 1200, left: 0, behavior: "auto" });
    other.remove();
  });

  it("stops restoring as soon as the user touches the screen", async () => {
    const utils = renderShell();
    const main = utils.getByTestId("main");
    main.scrollTop = 900;
    fireEvent.scroll(main);
    await act(async () => { fireEvent.click(utils.getByText("push")); });
    flushFrames();

    await act(async () => { fireEvent.click(utils.getByText("back")); });
    // The user grabs the list before the restore has settled.
    fireEvent.touchStart(window);
    main.scrollTop = 50;
    flushFrames();
    expect(main.scrollTop).toBe(50);
  });

  it("keeps waiting while the scroll root is hidden behind Suspense", async () => {
    let hidden = true;
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return this.hasAttribute?.("data-scroll-root") && !hidden ? 600 : 0; } });
    const utils = renderShell();
    const main = utils.getByTestId("main");
    await act(async () => { fireEvent.click(utils.getByText("push")); });
    flushFrames(3);
    expect(frames.length).toBeGreaterThan(0); // still settling, not given up
    hidden = false;
    main.scrollTop = 300; // old offset revealed with the page
    flushFrames();
    expect(main.scrollTop).toBe(0);
  });
});

// ── Signature scaling ───────────────────────────────────────────────────

describe("SignaturePad fitScale", () => {
  it("shrinks a landscape signature to fit portrait instead of clipping it", () => {
    // Drawn on a 778×120 landscape canvas, shown on a 324×120 portrait one.
    const s = fitScale({ w: 778, h: 120 }, 324, 120);
    expect(778 * s).toBeLessThanOrEqual(324);
  });

  it("never enlarges past the height when the canvas widens", () => {
    const s = fitScale({ w: 324, h: 120 }, 778, 120);
    expect(s).toBe(1);
  });
});
