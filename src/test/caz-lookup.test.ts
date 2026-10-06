import { describe, it, expect } from "vitest";
import { lookupCazZone, computeJobCaz } from "@/lib/cazLookup";

describe("lookupCazZone — single postcode", () => {
  it("matches a London postcode to London ULEZ", () => {
    expect(lookupCazZone("SW1A 1AA")?.name).toBe("London ULEZ");
  });

  it("matches without a space in the postcode", () => {
    expect(lookupCazZone("E14AA")?.name).toBe("London ULEZ");
  });

  it("matches a Birmingham city-centre district", () => {
    expect(lookupCazZone("B1 1AA")?.name).toBe("Birmingham Clean Air Zone");
  });

  it("does not match a Birmingham-area postcode outside the zone's listed districts", () => {
    // B90 (Solihull) is in the wider "B" postcode area but not a listed CAZ district.
    expect(lookupCazZone("B90 1AA")).toBeNull();
  });

  it("matches a narrow district zone exactly, not by prefix overreach", () => {
    // BS1 is in the zone; BS11 must NOT match via a loose startsWith("BS1").
    expect(lookupCazZone("BS1 1AA")?.name).toBe("Bristol Clean Air Zone");
    expect(lookupCazZone("BS11 1AA")).toBeNull();
  });

  it("returns null for a postcode with no known zone", () => {
    expect(lookupCazZone("AB10 1AA")).toBeNull(); // Aberdeen
  });

  it("returns null for an unparseable input", () => {
    expect(lookupCazZone("")).toBeNull();
    expect(lookupCazZone("X")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(lookupCazZone("sw1a 1aa")?.name).toBe("London ULEZ");
  });
});

describe("computeJobCaz — pickup + delivery combined", () => {
  it("returns null flag and cost when neither postcode is in a zone", () => {
    const r = computeJobCaz("AB10 1AA", "AB11 1AA");
    expect(r.flag).toBeNull();
    expect(r.cost).toBeNull();
  });

  it("flags and charges once when only pickup is in a zone", () => {
    const r = computeJobCaz("SW1A 1AA", "AB10 1AA");
    expect(r.flag).toContain("London ULEZ");
    expect(r.cost).toBe(12.5);
  });

  it("flags and charges once when only delivery is in a zone", () => {
    const r = computeJobCaz("AB10 1AA", "SW1A 1AA");
    expect(r.flag).toContain("London ULEZ");
    expect(r.cost).toBe(12.5);
  });

  it("charges only once when both ends are the same zone", () => {
    const r = computeJobCaz("SW1A 1AA", "E1 4AA");
    expect(r.flag).toContain("London ULEZ");
    expect(r.cost).toBe(12.5);
  });

  it("sums distinct zones touched at each end", () => {
    const r = computeJobCaz("SW1A 1AA", "B1 1AA");
    expect(r.cost).toBe(12.5 + 8);
    expect(r.flag).toContain("London ULEZ");
    expect(r.flag).toContain("Birmingham Clean Air Zone");
  });

  it("appends a zone's note to the flag text when present", () => {
    const r = computeJobCaz("BS1 1AA", null);
    expect(r.flag).toContain("Bristol Clean Air Zone");
    expect(r.flag).toContain("not private cars");
  });

  it("treats missing postcodes as no-contribution, not a crash", () => {
    expect(computeJobCaz(null, null)).toEqual({ flag: null, cost: null });
    expect(computeJobCaz(undefined, undefined)).toEqual({ flag: null, cost: null });
  });
});
