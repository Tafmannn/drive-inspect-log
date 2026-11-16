import { describe, it, expect, vi, afterEach } from "vitest";
import { CAPTURE_JPEG_QUALITY, CAPTURE_MAX_DIMENSION, fitWithin, prepareCapturedPhoto } from "@/lib/capturedPhoto";

describe("fitWithin", () => {
  it("scales the long edge down to the upload size, keeping aspect ratio", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1440, height: 1920 });
    expect(fitWithin(8160, 6120)).toEqual({ width: 1920, height: 1440 });
  });

  it("never upscales and rejects bad sizes", () => {
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(0, 900)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(NaN, 900)).toEqual({ width: 0, height: 0 });
  });

  it("matches the upload pipeline's maximum", () => {
    expect(CAPTURE_MAX_DIMENSION).toBe(1920);
  });
});

// jsdom can't decode images or draw to canvas, so stand both in.
function stubDecoder(width: number, height: number, ok = true) {
  const OriginalImage = globalThis.Image;
  class FakeImage {
    naturalWidth = width;
    naturalHeight = height;
    width = width;
    height = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(v: string) {
      if (!v) return;
      queueMicrotask(() => (ok ? this.onload?.() : this.onerror?.()));
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
  return () => {
    globalThis.Image = OriginalImage;
  };
}

function stubCanvas(output: Blob | null) {
  const drawImage = vi.fn();
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => ({ drawImage }) as unknown as CanvasRenderingContext2D);
  const sizes: { w: number; h: number }[] = [];
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, "toBlob")
    .mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
      sizes.push({ w: this.width, h: this.height });
      cb(output);
    });
  return { drawImage, getContext, toBlob, sizes };
}

const bigPhoto = () => new File([new Uint8Array(6_000_000)], "IMG_1234.HEIC.jpg", { type: "image/jpeg", lastModified: 42 });

describe("prepareCapturedPhoto", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  it("downscales a large camera photo to the upload size as JPEG", async () => {
    restore = stubDecoder(4000, 3000);
    const canvas = stubCanvas(new Blob([new Uint8Array(400_000)], { type: "image/jpeg" }));
    const out = await prepareCapturedPhoto(bigPhoto());
    expect(canvas.sizes).toEqual([{ w: 1920, h: 1440 }]);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", CAPTURE_JPEG_QUALITY);
    expect(out.type).toBe("image/jpeg");
    expect(out.size).toBe(400_000);
    expect(out.name).toBe("IMG_1234.HEIC.jpg");
    expect(out.lastModified).toBe(42);
  });

  it("keeps a small, in-range photo as it is", async () => {
    restore = stubDecoder(1200, 900);
    const canvas = stubCanvas(null);
    const small = new File([new Uint8Array(300_000)], "small.jpg", { type: "image/jpeg" });
    const out = await prepareCapturedPhoto(small);
    expect(canvas.toBlob).not.toHaveBeenCalled();
    expect(out.size).toBe(300_000);
    expect(out).not.toBe(small); // still a detached copy
  });

  it("falls back to the full-size copy if encoding returns an empty blob", async () => {
    restore = stubDecoder(4000, 3000);
    stubCanvas(new Blob([]));
    const out = await prepareCapturedPhoto(bigPhoto());
    expect(out.size).toBe(6_000_000);
  });

  it("falls back to the full-size copy if the image can't be decoded (e.g. HEIC)", async () => {
    restore = stubDecoder(0, 0, false);
    const out = await prepareCapturedPhoto(bigPhoto());
    expect(out.size).toBe(6_000_000);
    expect(out.type).toBe("image/jpeg");
  });

  it("falls back if there's no 2D context", async () => {
    restore = stubDecoder(4000, 3000);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    const out = await prepareCapturedPhoto(bigPhoto());
    expect(out.size).toBe(6_000_000);
  });
});
