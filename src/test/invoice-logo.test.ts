// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_LOGO_URLS, loadImg, loadInvoiceLogo } from "@/lib/invoicePdf";

/**
 * The invoice banner's logo. It used to point at a Lovable-only asset path
 * that 404s anywhere else, so invoices went out with no logo.
 */
const PUBLIC = resolve(__dirname, "../../public");

function blobOf(type: string): Blob {
  return new Blob(["x"], { type });
}

/** An Image that "decodes" instantly with a fixed natural size (jsdom never loads images). */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  naturalWidth = 700;
  naturalHeight = 474;
  width = 700;
  height = 474;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

let routes: Record<string, { ok: boolean; type?: string }>;
let fetched: string[];

beforeEach(() => {
  routes = {};
  fetched = [];
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      const r = routes[url] ?? { ok: false };
      return { ok: r.ok, status: r.ok ? 200 : 404, blob: async () => blobOf(r.type ?? "image/png") };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("default logo files", () => {
  it("are real files in /public, served by any host, and never a Lovable-only path", () => {
    expect(DEFAULT_LOGO_URLS.length).toBeGreaterThan(0);
    for (const url of DEFAULT_LOGO_URLS) {
      expect(url.startsWith("/")).toBe(true);
      expect(url).not.toContain("__l5e");
      expect(existsSync(resolve(PUBLIC, url.slice(1)))).toBe(true);
    }
  });
});

describe("loadImg", () => {
  it("embeds a PNG or JPEG as it is, with its natural size", async () => {
    routes["/a.png"] = { ok: true, type: "image/png" };
    routes["/b.jpg"] = { ok: true, type: "image/jpeg" };
    expect(await loadImg("/a.png")).toMatchObject({ format: "PNG", w: 700, h: 474 });
    expect(await loadImg("/b.jpg")).toMatchObject({ format: "JPEG" });
  });

  it("re-encodes a WebP as PNG, because jsPDF cannot embed WebP", async () => {
    routes["/logo.webp"] = { ok: true, type: "image/webp" };
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AAAA");

    const logo = await loadImg("/logo.webp");
    expect(logo).toEqual({ dataUrl: "data:image/png;base64,AAAA", format: "PNG", w: 700, h: 474 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 700, 474);
  });

  it("gives up cleanly when a WebP cannot be converted", async () => {
    routes["/logo.webp"] = { ok: true, type: "image/webp" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(await loadImg("/logo.webp")).toBeNull();

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage() {} } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,AAAA");
    expect(await loadImg("/logo.webp")).toBeNull();
  });

  it("returns null for a missing file or a network failure", async () => {
    expect(await loadImg("/missing.png")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await loadImg("/x.png")).toBeNull();
  });
});

describe("loadInvoiceLogo", () => {
  it("falls back to the built-in logo when the preferred one 404s (the old Lovable path)", async () => {
    routes[DEFAULT_LOGO_URLS[1]] = { ok: true, type: "image/png" };
    const logo = await loadInvoiceLogo("/__l5e/assets-v1/x/axentra-logo-dark.png");
    expect(logo).toMatchObject({ format: "PNG" });
    expect(fetched).toEqual(["/__l5e/assets-v1/x/axentra-logo-dark.png", DEFAULT_LOGO_URLS[0], DEFAULT_LOGO_URLS[1]]);
  });

  it("uses the preferred logo first when it loads, and the defaults otherwise in order", async () => {
    routes["/custom.png"] = { ok: true, type: "image/png" };
    await loadInvoiceLogo("/custom.png");
    expect(fetched).toEqual(["/custom.png"]);

    fetched.length = 0;
    routes[DEFAULT_LOGO_URLS[0]] = { ok: true, type: "image/png" };
    await loadInvoiceLogo();
    expect(fetched).toEqual([DEFAULT_LOGO_URLS[0]]);
  });

  it("warns, and returns null, when no logo can be loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadInvoiceLogo()).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no logo could be loaded"), expect.anything());
  });
});
