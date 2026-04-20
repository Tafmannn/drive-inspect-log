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
