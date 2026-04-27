import { describe, it, expect } from "vitest";
import { safeRandomId, safeRandomIdWithPrefix } from "@/lib/safeRandomId";

describe("safeRandomId", () => {
  it("returns a UUID-shaped string", () => {
    const id = safeRandomId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("returns unique values across many invocations", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(safeRandomId());
    expect(set.size).toBe(1000);
  });

  it("prefix variant preserves the prefix", () => {
    const id = safeRandomIdWithPrefix("pu_");
    expect(id.startsWith("pu_")).toBe(true);
    expect(id.length).toBeGreaterThan(3);
  });
});
