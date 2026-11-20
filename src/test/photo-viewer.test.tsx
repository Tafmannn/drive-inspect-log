/**
 * The inspection photo viewer: thumbnails, the full-screen viewer, stepping, zoom,
 * photos that fail to load, and download. Includes the iPhone fix: the viewer is pinned
 * to the visible screen (dvh) and keeps its controls clear of the notch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-toast", () => ({ toast: (a: unknown) => toast(a) }));

import { PhotoViewer } from "@/components/PhotoViewer";

const PHOTOS = [
  { id: "p1", url: "https://x.test/1.jpg", label: "Front" },
  { id: "p2", url: "https://x.test/2.jpg", label: "Rear" },
  { id: "p3", url: "https://x.test/3.jpg" },
];

const thumbs = () => screen.getAllByRole("button").filter((b) => b.querySelector("img") || /Image unavailable/.test(b.textContent ?? ""));
const open = (i: number) => fireEvent.click(thumbs()[i]);
const viewer = () => screen.getByRole("dialog");
const bigImage = () => within(viewer()).getByRole("img") as HTMLImageElement;

describe("PhotoViewer — thumbnails", () => {
  it("shows nothing at all when there are no photos and none are missing", () => {
    const { container } = render(<PhotoViewer photos={[]} title="Pickup" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a titled grid with the count, using each photo's label or a default", () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup photos" />);
    expect(screen.getByText("Pickup photos (3)")).toBeInTheDocument();
    expect(screen.getByAltText("Front")).toBeInTheDocument();
    expect(screen.getByAltText("Photo 3")).toBeInTheDocument();
  });

  it("says how many are missing, with a retry when it can retry", () => {
    const onRetry = vi.fn();
    render(<PhotoViewer photos={PHOTOS.slice(0, 2)} title="Delivery" totalExpected={5} onRetry={onRetry} />);
    expect(screen.getByText("Delivery (2/5)")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry 3 missing"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("says how many could not be loaded when there is no way to retry", () => {
    render(<PhotoViewer photos={PHOTOS.slice(0, 2)} title="Delivery" totalExpected={5} />);
    expect(screen.getByText("3 photo(s) couldn't be loaded")).toBeInTheDocument();
    expect(screen.queryByText(/Retry/)).toBeNull();
  });

  it("with every photo missing it still says so, instead of vanishing", () => {
    render(<PhotoViewer photos={[]} title="Delivery" totalExpected={2} />);
    expect(screen.getByText("Delivery (0/2)")).toBeInTheDocument();
  });

  it("replaces a thumbnail that fails to load with one 'Image unavailable' box", () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    const img = screen.getByAltText("Front");
    fireEvent.error(img);
    fireEvent.error(screen.queryByAltText("Front") ?? img); // a second error must not stack another box
    expect(screen.getAllByText("Image unavailable")).toHaveLength(1);
  });
});

describe("PhotoViewer — the full-screen viewer", () => {
  it("opens on the photo tapped, with its label and no entry animation", () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(1);
    expect(within(viewer()).getByText("Rear")).toBeInTheDocument();
    expect(bigImage().getAttribute("src")).toBe("https://x.test/2.jpg");
  });

  it("falls back to 'Photo n of total' for an unlabelled photo", () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(2);
    expect(within(viewer()).getByText("Photo 3 of 3")).toBeInTheDocument();
  });

  it("is pinned to the visible screen (dvh) and clears the notch, home indicator and sides", () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(0);
    const cls = viewer().className;
    expect(cls).toContain("h-dvh");
    expect(cls).toContain("max-h-[100dvh]");
    expect(cls).not.toContain("100vh");
    expect(cls).not.toContain("100vw");
    expect(cls).toContain("overscroll-contain");

    const topBar = within(viewer()).getByText("Front").parentElement as HTMLElement;
    expect(topBar.className).toContain("env(safe-area-inset-top)");
    expect(topBar.className).toContain("env(safe-area-inset-left)");
    expect(topBar.className).toContain("env(safe-area-inset-right)");
    expect(within(viewer()).getByLabelText("Previous photo").className).toContain("env(safe-area-inset-left)");
    expect(within(viewer()).getByLabelText("Next photo").className).toContain("env(safe-area-inset-right)");
  });

  it("steps forwards and back, wrapping round at both ends", () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(0);
    fireEvent.click(within(viewer()).getByLabelText("Previous photo")); // 0 -> last
    expect(bigImage().getAttribute("src")).toBe("https://x.test/3.jpg");
    fireEvent.click(within(viewer()).getByLabelText("Next photo")); // last -> 0
    expect(bigImage().getAttribute("src")).toBe("https://x.test/1.jpg");
    fireEvent.click(within(viewer()).getByLabelText("Next photo"));
    expect(bigImage().getAttribute("src")).toBe("https://x.test/2.jpg");
  });

  it("the dots jump straight to a photo", () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(0);
    const dots = within(viewer()).getAllByRole("button").filter((b) => b.className.includes("w-2 h-2"));
    expect(dots).toHaveLength(3);
    fireEvent.click(dots[2]);
    expect(bigImage().getAttribute("src")).toBe("https://x.test/3.jpg");
  });

  it("has no arrows or dots for a single photo", () => {
    render(<PhotoViewer photos={PHOTOS.slice(0, 1)} title="Pickup" />);
    open(0);
    expect(within(viewer()).queryByLabelText("Next photo")).toBeNull();
    expect(within(viewer()).queryByLabelText("Previous photo")).toBeNull();
  });

  it("zoom goes 1x, 2x, 3x and back, and stepping to another photo resets it", () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(0);
    const zoomButton = () => within(viewer()).getAllByRole("button").find((b) => b.querySelector("svg.lucide-zoom-in, svg.lucide-zoom-out"))!;
    expect(bigImage().style.transform).toBe("scale(1)");
    fireEvent.click(zoomButton());
    expect(bigImage().style.transform).toBe("scale(2)");
    fireEvent.click(zoomButton());
    expect(bigImage().style.transform).toBe("scale(3)");
    fireEvent.click(within(viewer()).getByLabelText("Next photo"));
    expect(bigImage().style.transform).toBe("scale(1)");
    fireEvent.click(zoomButton());
    fireEvent.click(zoomButton());
    fireEvent.click(zoomButton());
    expect(bigImage().style.transform).toBe("scale(1)"); // 3x -> back to 1x
  });

  it("closes", async () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(0);
    fireEvent.click(within(viewer()).getByLabelText("Close photo"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says so when the big photo cannot be loaded", () => {
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(0);
    fireEvent.error(bigImage());
    expect(within(viewer()).getByText("Image could not be loaded")).toBeInTheDocument();
  });
});

describe("PhotoViewer — download", () => {
  let click: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    click = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:fake");
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    toast.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const downloadButton = () => within(viewer()).getAllByRole("button").find((b) => b.querySelector("svg.lucide-download"))!;

  it("saves the photo under its label, with the right extension", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) }));
    let download = "";
    click.mockImplementation(function (this: HTMLAnchorElement) {
      download = this.download;
    });
    render(<PhotoViewer photos={[{ url: "https://x.test/a.png", label: "Front / left?" }]} title="Pickup" />);
    open(0);
    fireEvent.click(downloadButton());
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(download).toBe("Front___left_.png"); // unsafe characters replaced
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("names an unlabelled photo by its position, and understands webp and jpeg", async () => {
    const names: string[] = [];
    click.mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    for (const type of ["image/webp", "image/jpeg"]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"], { type }) }));
      const { unmount } = render(<PhotoViewer photos={[{ url: "https://x.test/a" }]} title="Pickup" />);
      open(0);
      fireEvent.click(downloadButton());
      await waitFor(() => expect(names.length).toBeGreaterThan(0));
      unmount();
    }
    expect(names).toEqual(["photo_1.webp", "photo_1.jpg"]);
  });

  it("opens the photo in a new tab when it cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(0);
    fireEvent.click(downloadButton());
    await waitFor(() => expect(openWindow).toHaveBeenCalledWith("https://x.test/1.jpg", "_blank"));
    expect(toast).not.toHaveBeenCalled();
  });

  it("tells the user when even a new tab is blocked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(window, "open").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<PhotoViewer photos={PHOTOS} title="Pickup" />);
    open(0);
    fireEvent.click(downloadButton());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Download failed", variant: "destructive" })));
  });
});
