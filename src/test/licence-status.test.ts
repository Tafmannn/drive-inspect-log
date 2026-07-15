import { describe, it, expect } from "vitest";
import { licenceStatus } from "@/features/onboarding/lib/licenceStatus";

const NOW = new Date("2026-07-14T12:00:00Z");

describe("licenceStatus", () => {
  it("returns unknown for a missing expiry", () => {
    expect(licenceStatus(null, NOW)).toBe("unknown");
    expect(licenceStatus(undefined, NOW)).toBe("unknown");
  });

  it("returns unknown for an unparsable date", () => {
    expect(licenceStatus("not-a-date", NOW)).toBe("unknown");
  });

  it("returns expired for a past date", () => {
    expect(licenceStatus("2026-01-01", NOW)).toBe("expired");
  });

  it("returns expiring for a date within 30 days", () => {
    expect(licenceStatus("2026-08-01", NOW)).toBe("expiring"); // 18 days out
  });

  it("returns valid for a date more than 30 days out", () => {
    expect(licenceStatus("2027-01-01", NOW)).toBe("valid");
  });

  it("treats the boundary day (exactly 30 days) as expiring", () => {
    expect(licenceStatus("2026-08-13", NOW)).toBe("expiring");
  });

  it("treats today as expiring, not expired", () => {
    expect(licenceStatus("2026-07-14", NOW)).toBe("expiring");
  });
});
