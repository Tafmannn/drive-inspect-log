import "@testing-library/jest-dom";
import "fake-indexeddb/auto";

// jsdom does not implement URL.createObjectURL / revokeObjectURL.
// pendingUploads.compressToBlob uses these to load images into <img>;
// we stub them so the call doesn't throw. Image decoding will then fail in
// jsdom (no real renderer) and the helper falls back to the raw File — which
// is the documented behaviour and is exactly what the tests exercise.
if (typeof URL.createObjectURL !== "function") {
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
    () => "blob:mock";
}
if (typeof URL.revokeObjectURL !== "function") {
  (URL as unknown as { revokeObjectURL: (s: string) => void }).revokeObjectURL =
    () => {};
}

// jsdom's HTMLImageElement does not fire onload/onerror, which would hang
// any code path that awaits image decoding (e.g. compressToBlob in
// pendingUploads). Patch the Image prototype so that assigning `src` schedules
// an immediate `onerror` — the helper's documented fallback then resolves with
// the raw file, keeping the queue tests deterministic and fast.
const ImgProto = (globalThis as unknown as { Image?: { prototype: HTMLImageElement } })
  .Image?.prototype;
if (ImgProto) {
  Object.defineProperty(ImgProto, "src", {
    configurable: true,
    set(this: HTMLImageElement) {
      queueMicrotask(() => {
        this.onerror?.(new Event("error"));
      });
    },
    get() {
      return "";
    },
  });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
