import { describe, expect, it } from "vitest";
import { OFFLINE_GRACE_MS, remainingCredentialMs } from "./useDigitalCredential";

describe("Digital ID time-limited authorisation", () => {
  const valid = { monotonicMs: 5000, wallMs: 100_000, windowMs: OFFLINE_GRACE_MS };

  it("never treats a missing successful status check as valid", () => {
    expect(remainingCredentialMs(null, 0, 0)).toBe(0);
  });

  it("expires an offline credential after 30 seconds", () => {
    expect(remainingCredentialMs(valid, 5000, 100_000)).toBe(30_000);
    expect(remainingCredentialMs(valid, 20_000, 115_000)).toBe(15_000);
    expect(remainingCredentialMs(valid, 35_000, 130_000)).toBe(0);
    expect(remainingCredentialMs(valid, 120_000, 215_000)).toBe(0);
  });

  it("uses the stricter clock and cannot extend the interval when phone time moves backwards", () => {
    expect(remainingCredentialMs(valid, 25_000, 90_000)).toBe(10_000);
    expect(remainingCredentialMs(valid, 10_000, 131_000)).toBe(0);
  });

  it("respects an even shorter server-side validity window", () => {
    const short = { ...valid, windowMs: 4_000 };
    expect(remainingCredentialMs(short, 8_999, 100_000)).toBe(1);
    expect(remainingCredentialMs(short, 9_000, 100_000)).toBe(0);
  });
});
