// The PDF banner uses a transparent Axentra lockup so it sits on the navy
// gradient. Pin that the asset exists, keeps its transparency, and is the one
// the PDF code loads.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Axentra PDF banner logo", () => {
  const png = readFileSync("public/brand/axentra-logo-on-dark.png");

  it("is a PNG with an alpha channel", () => {
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    const colourType = png[25]; // IHDR colour type
    expect(colourType).toBe(6); // RGBA
  });

  it("is a sensible size for a PDF (not an oversized original)", () => {
    expect(png.length).toBeLessThan(400_000);
    expect(png.readUInt32BE(16)).toBe(720); // width
  });

  it("is the file the POD/POC PDF loads", () => {
    const src = readFileSync("src/lib/podPdf.ts", "utf8");
    expect(src).toContain("/brand/axentra-logo-on-dark.png");
  });
});
