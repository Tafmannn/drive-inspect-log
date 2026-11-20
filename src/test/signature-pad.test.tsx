/**
 * The signature pad, driven the way a finger and a rotating phone drive it.
 * jsdom has no canvas, so the 2D context is a recording stand-in; what is checked is
 * what the pad asks the canvas to draw, where ink lands, what is kept in the tab, and
 * that a drawing survives the canvas being resized (the iPhone rotation bug).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { SignaturePad, type SignaturePadRef } from "@/components/SignaturePad";

// ── A recording 2D context ──────────────────────────────────────────
function fakeContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    lineCap: "",
    lineJoin: "",
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
  };
}
let ctx: ReturnType<typeof fakeContext>;

// ── A ResizeObserver the test can fire by hand ──────────────────────
let resizeCallback: ResizeObserverCallback | null = null;
let disconnected = false;
class FakeResizeObserver {
  constructor(cb: ResizeObserverCallback) {
    resizeCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {
    disconnected = true;
  }
}

function resizeTo(canvas: HTMLCanvasElement, width: number, height: number) {
  act(() => {
    resizeCallback?.(
      [{ target: canvas, contentRect: { width, height } } as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

// ── Pointer events (jsdom has no PointerEvent; the pad only reads these fields) ──
function pointer(canvas: HTMLElement, type: string, x: number, y: number) {
  const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperty(e, "pointerId", { value: 1 });
  act(() => {
    canvas.dispatchEvent(e);
  });
  return e;
}

function mount(props: Partial<React.ComponentProps<typeof SignaturePad>> = {}) {
  const ref = createRef<SignaturePadRef>();
  const utils = render(<SignaturePad ref={ref} {...props} />);
  const canvas = utils.container.querySelector("canvas") as HTMLCanvasElement;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 120, right: 300, bottom: 120, x: 0, y: 0, toJSON() {} }) as DOMRect;
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  return { ref, canvas, ...utils };
}

const KEY = "axentra.signature.pickup.job-1.driver";

beforeEach(() => {
  ctx = fakeContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  resizeCallback = null;
  disconnected = false;
  Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SignaturePad — drawing", () => {
  it("starts empty, and does not draw before the canvas has been measured", () => {
    const { ref, canvas } = mount();
    expect(ref.current!.isEmpty()).toBe(true);
    pointer(canvas, "pointerdown", 10, 10); // size unknown yet: ignored
    expect(ref.current!.isEmpty()).toBe(true);
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
  });

  it("sizes the canvas's backing store to its CSS size times the screen density", () => {
    const { canvas } = mount();
    resizeTo(canvas, 300, 120);
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(240);
    resizeTo(canvas, 150.4, 120);
    expect(canvas.width).toBe(301); // rounded
  });

  it("ignores a zero-size report, which is what a hidden step looks like", () => {
    const { canvas } = mount();
    resizeTo(canvas, 300, 120);
    resizeTo(canvas, 0, 0);
    expect(canvas.width).toBe(600); // unchanged
  });

  it("a drag draws a line through each point, and the first touch says 'signing started'", () => {
    const onSignStart = vi.fn();
    const { ref, canvas } = mount({ onSignStart });
    resizeTo(canvas, 300, 120);

    pointer(canvas, "pointerdown", 20, 30);
    pointer(canvas, "pointermove", 40, 50);
    pointer(canvas, "pointermove", 60, 70);
    pointer(canvas, "pointerup", 60, 70);

    expect(ref.current!.isEmpty()).toBe(false);
    expect(onSignStart).toHaveBeenCalledTimes(1);
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(ctx.moveTo).toHaveBeenCalledWith(20, 30);
    expect(ctx.lineTo).toHaveBeenCalledWith(40, 50);
    expect(ctx.lineTo).toHaveBeenCalledWith(60, 70);
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it("a second stroke does not say 'signing started' again", () => {
    const onSignStart = vi.fn();
    const { canvas } = mount({ onSignStart });
    resizeTo(canvas, 300, 120);
    for (const x of [10, 100]) {
      pointer(canvas, "pointerdown", x, 20);
      pointer(canvas, "pointermove", x + 10, 30);
      pointer(canvas, "pointerup", x + 10, 30);
    }
    expect(onSignStart).toHaveBeenCalledTimes(1);
  });

  it("a single tap leaves a dot", () => {
    const { ref, canvas } = mount();
    resizeTo(canvas, 300, 120);
    pointer(canvas, "pointerdown", 50, 50);
    pointer(canvas, "pointerup", 50, 50);
    expect(ref.current!.isEmpty()).toBe(false);
    expect(ctx.arc).toHaveBeenCalledWith(50, 50, expect.any(Number), 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalled();
  });

  it("stops the page scrolling or selecting while signing", () => {
    const { canvas } = mount();
    resizeTo(canvas, 300, 120);
    expect(pointer(canvas, "pointerdown", 5, 5).defaultPrevented).toBe(true);
    expect(pointer(canvas, "pointermove", 9, 9).defaultPrevented).toBe(true);
  });

  it("moving the pointer without pressing draws nothing", () => {
    const { ref, canvas } = mount();
    resizeTo(canvas, 300, 120);
    pointer(canvas, "pointermove", 40, 50);
    expect(ref.current!.isEmpty()).toBe(true);
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });

  it("a cancelled touch (the phone took it over) ends the stroke cleanly", () => {
    const { ref, canvas } = mount();
    resizeTo(canvas, 300, 120);
    pointer(canvas, "pointerdown", 10, 10);
    pointer(canvas, "pointermove", 20, 20);
    pointer(canvas, "pointercancel", 20, 20);
    ctx.lineTo.mockClear();
    pointer(canvas, "pointermove", 90, 90); // no longer drawing
    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ref.current!.isEmpty()).toBe(false); // what was drawn is kept
  });

  it("ink lands exactly under the finger, ignoring the canvas border", () => {
    const { canvas } = mount();
    Object.defineProperty(canvas, "clientLeft", { value: 1 });
    Object.defineProperty(canvas, "clientTop", { value: 2 });
    canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 120, right: 310, bottom: 140, x: 10, y: 20, toJSON() {} }) as DOMRect;
    resizeTo(canvas, 300, 120);
    pointer(canvas, "pointerdown", 61, 72); // 61 - 10 - 1 = 50, 72 - 20 - 2 = 50
    expect(ctx.arc).toHaveBeenCalledWith(50, 50, expect.any(Number), 0, Math.PI * 2);
  });

  it("stops listening when it is removed", () => {
    const { canvas, unmount } = mount();
    resizeTo(canvas, 300, 120);
    unmount();
    expect(disconnected).toBe(true);
    pointer(canvas, "pointerdown", 10, 10);
    expect(canvas.setPointerCapture).not.toHaveBeenCalled();
  });
});

describe("SignaturePad — rotating the phone", () => {
  it("redraws the signature scaled to fit when the canvas shrinks, so nothing is clipped", () => {
    const { canvas } = mount();
    resizeTo(canvas, 600, 120); // landscape
    pointer(canvas, "pointerdown", 500, 60);
    pointer(canvas, "pointermove", 580, 100);
    pointer(canvas, "pointerup", 580, 100);

    ctx.setTransform.mockClear();
    ctx.moveTo.mockClear();
    ctx.lineTo.mockClear();
    resizeTo(canvas, 300, 120); // back to portrait: half the width

    // dpr 2 x scale 0.5 = 1, both axes
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    // the stroke is redrawn in its original space; the transform does the shrinking
    expect(ctx.moveTo).toHaveBeenCalledWith(500, 60);
    expect(ctx.lineTo).toHaveBeenCalledWith(580, 100);
    expect(ctx.clearRect).toHaveBeenCalled();
  });

  it("a new stroke after rotating still lands under the finger", () => {
    const { canvas } = mount();
    resizeTo(canvas, 600, 120);
    pointer(canvas, "pointerdown", 400, 60);
    pointer(canvas, "pointerup", 400, 60);
    resizeTo(canvas, 300, 120); // scale 0.5

    ctx.arc.mockClear();
    pointer(canvas, "pointerdown", 100, 40); // screen px -> reference space: / 0.5
    expect(ctx.arc).toHaveBeenCalledWith(200, 80, expect.any(Number), 0, Math.PI * 2);
  });
});

describe("SignaturePad — keeping the signature in the tab", () => {
  it("saves the strokes when a stroke ends", () => {
    const { canvas } = mount({ persistKey: KEY });
    resizeTo(canvas, 300, 120);
    pointer(canvas, "pointerdown", 10, 10);
    pointer(canvas, "pointermove", 30, 30);
    expect(sessionStorage.getItem(KEY)).toBeNull(); // not until the stroke ends
    pointer(canvas, "pointerup", 30, 30);

    const saved = JSON.parse(sessionStorage.getItem(KEY)!);
    expect(saved.ref).toEqual({ w: 300, h: 120 });
    expect(saved.strokes).toEqual([[[10, 10], [30, 30]]]);
  });

  it("does not save anything when no key was given", () => {
    const { canvas } = mount();
    resizeTo(canvas, 300, 120);
    pointer(canvas, "pointerdown", 10, 10);
    pointer(canvas, "pointerup", 10, 10);
    expect(sessionStorage.length).toBe(0);
  });

  it("brings a saved signature back after a reload, and counts as signed straight away", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ ref: { w: 300, h: 120 }, strokes: [[[1, 2], [3, 4]]] }));
    const onSignStart = vi.fn();
    const { ref, canvas } = mount({ persistKey: KEY, onSignStart });
    expect(ref.current!.isEmpty()).toBe(false);
    expect(onSignStart).toHaveBeenCalledTimes(1);

    resizeTo(canvas, 300, 120); // drawn onto the new canvas
    expect(ctx.moveTo).toHaveBeenCalledWith(1, 2);
    expect(ctx.lineTo).toHaveBeenCalledWith(3, 4);
  });

  it.each([
    ["not JSON", "{oops"],
    ["no size", JSON.stringify({ strokes: [[[1, 1]]] })],
    ["a zero size", JSON.stringify({ ref: { w: 0, h: 0 }, strokes: [[[1, 1]]] })],
    ["strokes that are not a list", JSON.stringify({ ref: { w: 1, h: 1 }, strokes: "x" })],
    ["no strokes", JSON.stringify({ ref: { w: 300, h: 120 }, strokes: [] })],
  ])("ignores saved data that is %s", (_name, raw) => {
    sessionStorage.setItem(KEY, raw);
    const onSignStart = vi.fn();
    const { ref } = mount({ persistKey: KEY, onSignStart });
    expect(ref.current!.isEmpty()).toBe(true);
    expect(onSignStart).not.toHaveBeenCalled();
  });

  it("Clear wipes the drawing and the saved copy", () => {
    const { ref, canvas } = mount({ persistKey: KEY });
    resizeTo(canvas, 300, 120);
    pointer(canvas, "pointerdown", 10, 10);
    pointer(canvas, "pointerup", 10, 10);
    expect(sessionStorage.getItem(KEY)).not.toBeNull();

    act(() => ref.current!.clear());

    expect(ref.current!.isEmpty()).toBe(true);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(ctx.clearRect).toHaveBeenCalled();
  });

  it("still works when the browser refuses to store (private mode, full storage)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { ref, canvas } = mount({ persistKey: KEY });
    resizeTo(canvas, 300, 120);
    pointer(canvas, "pointerdown", 10, 10);
    expect(() => pointer(canvas, "pointerup", 10, 10)).not.toThrow();
    expect(ref.current!.isEmpty()).toBe(false);
  });
});

describe("SignaturePad — saving the picture", () => {
  it("makes a PNG file with the name it is given", async () => {
    const { ref, canvas } = mount();
    canvas.toBlob = (cb: BlobCallback) => cb(new Blob(["png-bytes"], { type: "image/png" }));
    const file = await ref.current!.toFile("driver-signature.png");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("driver-signature.png");
    expect(file.type).toBe("image/png");
  });

  it("says so, rather than returning an empty file, when the canvas cannot make one", async () => {
    const { ref, canvas } = mount();
    canvas.toBlob = (cb: BlobCallback) => cb(null);
    await expect(ref.current!.toFile("x.png")).rejects.toThrow("Canvas toBlob failed");
  });
});
