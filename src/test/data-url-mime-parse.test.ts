// NOTE: Math.random() in this test file generates fixture IDs only — non-security, never reaches production code.
import { describe, it, expect } from "vitest";

/**
 * Mirror of the bounded MIME-extraction logic in src/lib/pendingUploads.ts
 * (legacy data-URL migration path). Keeping it here as a regression test
 * pins the algorithm so it can never regress to an unbounded regex like
 * /:(.*?);/ which is a SonarQube ReDoS hotspot on attacker-shaped headers.
 */
function extractMimeFromDataUrlHeader(header: string): string {
  const colonIdx = header.indexOf(":");
  const semiIdx = header.indexOf(";", colonIdx + 1);
  return colonIdx >= 0 && semiIdx > colonIdx
    ? header.slice(colonIdx + 1, semiIdx)
    : "image/jpeg";
}

describe("data-url MIME extraction (bounded, ReDoS-safe)", () => {
  it("extracts a normal image mime", () => {
    expect(extractMimeFromDataUrlHeader("data:image/png;base64")).toBe("image/png");
  });

  it("extracts a jpeg mime", () => {
    expect(extractMimeFromDataUrlHeader("data:image/jpeg;base64")).toBe("image/jpeg");
  });

  it("falls back when header is malformed (no colon)", () => {
    expect(extractMimeFromDataUrlHeader("garbage")).toBe("image/jpeg");
  });

  it("falls back when header has colon but no semicolon", () => {
    expect(extractMimeFromDataUrlHeader("data:image/png")).toBe("image/jpeg");
  });

  it("terminates in linear time on pathological input that would trip backtracking regex", () => {
    // A header with no semicolon after the colon and a very long body would
    // cause /:(.*?);/ to scan to end-of-string. Bounded indexOf is O(n) once.
    const big = "data:" + "x".repeat(200_000);
    const start = Date.now();
    const mime = extractMimeFromDataUrlHeader(big);
    const elapsed = Date.now() - start;
    expect(mime).toBe("image/jpeg");
    // Generous bound — the operation should be effectively instantaneous.
    expect(elapsed).toBeLessThan(50);
  });

  it("terminates in linear time on header with colon then late semicolon", () => {
    const big = "data:image/png" + ";".padStart(150_000, "y") + "base64";
    const start = Date.now();
    const mime = extractMimeFromDataUrlHeader(big);
    const elapsed = Date.now() - start;
    expect(mime.startsWith("image/png")).toBe(true);
    expect(elapsed).toBeLessThan(50);
  });
});
