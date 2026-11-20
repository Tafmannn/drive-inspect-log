/**
 * The helpers behind the signature pad: how a drawing is scaled when the phone rotates,
 * and where an inspection's unsaved signatures are kept in the browser tab.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearSignatureDrafts, fitScale, signatureDraftKey } from "@/lib/signatureDraft";

describe("fitScale", () => {
  it("is 1 when the drawing and the canvas are the same size", () => {
    expect(fitScale({ w: 300, h: 120 }, 300, 120)).toBe(1);
  });

  it("shrinks a wide landscape drawing to fit a narrower portrait canvas", () => {
    expect(fitScale({ w: 600, h: 120 }, 300, 120)).toBe(0.5);
  });

  it("is limited by whichever side is tighter, so nothing is clipped", () => {
    expect(fitScale({ w: 300, h: 200 }, 600, 100)).toBe(0.5); // height is the limit
    expect(fitScale({ w: 300, h: 100 }, 150, 400)).toBe(0.5); // width is the limit
  });

  it("falls back to 1 while any size is still unknown (before the first draw or measure)", () => {
    expect(fitScale({ w: 0, h: 0 }, 300, 120)).toBe(1);
    expect(fitScale({ w: 300, h: 0 }, 300, 120)).toBe(1);
    expect(fitScale({ w: 300, h: 120 }, 0, 120)).toBe(1);
    expect(fitScale({ w: 300, h: 120 }, 300, 0)).toBe(1);
  });
});

describe("signatureDraftKey", () => {
  it("is different for each inspection, job and signer, so drafts never mix", () => {
    const a = signatureDraftKey("pickup", "job-1", "driver");
    expect(a).toBe("axentra.signature.pickup.job-1.driver");
    expect(signatureDraftKey("delivery", "job-1", "driver")).not.toBe(a);
    expect(signatureDraftKey("pickup", "job-2", "driver")).not.toBe(a);
    expect(signatureDraftKey("pickup", "job-1", "customer")).not.toBe(a);
  });
});

describe("clearSignatureDrafts", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("forgets both signatures for that inspection and leaves everything else alone", () => {
    const driver = signatureDraftKey("pickup", "job-1", "driver");
    const customer = signatureDraftKey("pickup", "job-1", "customer");
    const otherJob = signatureDraftKey("pickup", "job-2", "driver");
    const otherType = signatureDraftKey("delivery", "job-1", "driver");
    for (const k of [driver, customer, otherJob, otherType, "unrelated"]) sessionStorage.setItem(k, "x");

    clearSignatureDrafts("pickup", "job-1");

    expect(sessionStorage.getItem(driver)).toBeNull();
    expect(sessionStorage.getItem(customer)).toBeNull();
    expect(sessionStorage.getItem(otherJob)).toBe("x");
    expect(sessionStorage.getItem(otherType)).toBe("x");
    expect(sessionStorage.getItem("unrelated")).toBe("x");
  });

  it("does nothing, and does not crash, when the browser blocks storage", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearSignatureDrafts("pickup", "job-1")).not.toThrow();
  });
});
