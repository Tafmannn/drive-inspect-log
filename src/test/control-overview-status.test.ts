import { describe, expect, it } from "vitest";
import { overviewStatus } from "@/features/control/overviewStatus";

const s = (severities: string[], loading = false, error = false) => overviewStatus({ loading, error, severities }).label;

describe("Command Center status chip", () => {
  it("never claims All Clear while loading or after an error", () => {
    expect(s([], true)).toBe("Checking…");
    expect(s([], false, true)).toBe("Status unavailable");
  });
  it("medium/low exceptions are not All Clear", () => {
    expect(s(["medium", "medium", "low"])).toBe("3 open items");
    expect(s(["low"])).toBe("1 open item");
  });
  it("escalates on high and critical", () => {
    expect(s(["medium", "high"])).toBe("Attention Required");
    expect(s(["high", "critical"])).toBe("Critical");
  });
  it("All Clear only with zero open exceptions", () => {
    expect(s([])).toBe("All Clear");
  });
});
