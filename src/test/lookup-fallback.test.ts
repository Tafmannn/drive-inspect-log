/**
 * The rules behind the postcode and company lookups when Google refuses a
 * request (billing off, API not enabled, quota): how a refusal is told apart
 * from "no match", and how the free postcode fallback is turned into a
 * suggestion. Shared with the two edge functions via _shared/lookupFallback.ts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  geocodeRefused,
  normalisePostcode,
  parsePostcodesIo,
  placesRefused,
  timeoutSignal,
} from "../../supabase/functions/_shared/lookupFallback";

describe("normalisePostcode", () => {
  it("puts the space in the right place and upper-cases", () => {
    expect(normalisePostcode("ls115qr")).toBe("LS11 5QR");
    expect(normalisePostcode(" sw1a  2aa ")).toBe("SW1A 2AA");
    expect(normalisePostcode("M11AE")).toBe("M1 1AE");
    expect(normalisePostcode("EC1A1BB")).toBe("EC1A 1BB");
  });

  it("leaves anything that isn't a postcode trimmed and upper-cased", () => {
    expect(normalisePostcode(" not a postcode ")).toBe("NOT A POSTCODE");
    expect(normalisePostcode("")).toBe("");
  });
});

describe("telling a Google refusal from 'no match'", () => {
  it("Places (New): a 403 or 429 is a refusal, a 200 with no places is not", () => {
    expect(placesRefused(false, { error: { code: 403, status: "PERMISSION_DENIED" } })).toBe(true);
    expect(placesRefused(false, {})).toBe(true);
    expect(placesRefused(true, { error: { code: 429 } })).toBe(true);
    expect(placesRefused(true, {})).toBe(false);
    expect(placesRefused(true, { places: [] })).toBe(false);
    expect(placesRefused(true, null)).toBe(false);
  });

  it("Geocoding / legacy Places: denied and quota statuses are refusals, ZERO_RESULTS is not", () => {
    expect(geocodeRefused("REQUEST_DENIED")).toBe(true);
    expect(geocodeRefused("OVER_QUERY_LIMIT")).toBe(true);
    expect(geocodeRefused("OVER_DAILY_LIMIT")).toBe(true);
    expect(geocodeRefused("ZERO_RESULTS")).toBe(false);
    expect(geocodeRefused("OK")).toBe(false);
    expect(geocodeRefused(undefined)).toBe(false);
    expect(geocodeRefused(403)).toBe(false);
  });
});

describe("parsePostcodesIo", () => {
  const ok = { status: 200, result: { postcode: "SW1A 2AA", admin_district: "Westminster", region: "London" } };

  it("gives one area-only suggestion: no street, council area as the town", () => {
    expect(parsePostcodesIo(ok, "sw1a2aa")).toEqual([
      {
        id: "postcodes-io:SW1A 2AA",
        label: "SW1A 2AA, Westminster area (street not available)",
        line1: "",
        town: "Westminster",
        postcode: "SW1A 2AA",
      },
    ]);
  });

  it("falls back to county then region when there is no council area", () => {
    expect(parsePostcodesIo({ result: { postcode: "AB1 2CD", admin_county: "Somewhere" } }, "")[0].town).toBe("Somewhere");
    expect(parsePostcodesIo({ result: { postcode: "AB1 2CD", region: "Scotland" } }, "")[0].town).toBe("Scotland");
  });

  it("still returns the postcode, with no area, when nothing else is known", () => {
    const [s] = parsePostcodesIo({ result: { postcode: "AB1 2CD" } }, "ab12cd");
    expect(s).toMatchObject({ town: "", postcode: "AB1 2CD", label: "AB1 2CD (street not available)" });
  });

  it("uses the postcode the user typed when the service omits it", () => {
    expect(parsePostcodesIo({ result: { admin_district: "Leeds" } }, "ls115qr")[0].postcode).toBe("LS11 5QR");
  });

  it("returns nothing for a not-found or malformed answer", () => {
    expect(parsePostcodesIo({ status: 404, error: "Postcode not found" }, "ZZ99 9ZZ")).toEqual([]);
    expect(parsePostcodesIo(null, "ZZ99 9ZZ")).toEqual([]);
    expect(parsePostcodesIo("oops", "ZZ99 9ZZ")).toEqual([]);
    expect(parsePostcodesIo({ result: "nope" }, "ZZ99 9ZZ")).toEqual([]);
  });
});

describe("timeoutSignal", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the runtime's own AbortSignal.timeout when there is one", () => {
    const own = new AbortController().signal;
    const timeout = vi.fn(() => own);
    vi.stubGlobal("AbortSignal", { timeout });
    expect(timeoutSignal(1234)).toBe(own);
    expect(timeout).toHaveBeenCalledWith(1234);
  });

  it("falls back to a timer when the runtime has no AbortSignal.timeout", () => {
    vi.useFakeTimers();
    vi.stubGlobal("AbortSignal", {});
    const signal = timeoutSignal(5000);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(4999);
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(2);
    expect(signal.aborted).toBe(true);
  });
});
