import { describe, it, expect } from "vitest";

// Mirrors the client-side search predicate applied in AdminDrivers after the
// pill filter: match against name, phone, plate, or licence number,
// case-insensitively. Kept as a pure test so the matching rule is pinned even
// though the page composes it inline.
interface Row {
  displayName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  latestJobReg?: string | null;
  licenceNumber?: string | null;
}

function matches(rows: Row[], search: string): Row[] {
  const q = search.trim().toLowerCase();
  return rows.filter((d) => {
    if (!q) return true;
    return [d.displayName, d.fullName, d.phone, d.latestJobReg, d.licenceNumber]
      .some((v) => v && String(v).toLowerCase().includes(q));
  });
}

const rows: Row[] = [
  { displayName: "Alice Brown", phone: "+447700111", latestJobReg: "AB12 CDE", licenceNumber: "BROWN901" },
  { displayName: "Bob Green", fullName: "Robert Green", phone: "+447700222", latestJobReg: "XY99 ZZZ" },
  { displayName: "Carol White", phone: null, licenceNumber: "WHITE123" },
];

describe("AdminDrivers search predicate", () => {
  it("returns everything for an empty query", () => {
    expect(matches(rows, "")).toHaveLength(3);
    expect(matches(rows, "   ")).toHaveLength(3);
  });

  it("matches on name case-insensitively", () => {
    expect(matches(rows, "alice")).toHaveLength(1);
    expect(matches(rows, "GREEN")).toHaveLength(1);
  });

  it("matches on the full name even when the display name differs", () => {
    expect(matches(rows, "robert")[0].displayName).toBe("Bob Green");
  });

  it("matches on phone, plate and licence number", () => {
    expect(matches(rows, "0222")).toHaveLength(1);
    expect(matches(rows, "ab12")).toHaveLength(1);
    expect(matches(rows, "white123")).toHaveLength(1);
  });

  it("tolerates null fields without throwing", () => {
    expect(() => matches(rows, "carol")).not.toThrow();
    expect(matches(rows, "carol")).toHaveLength(1);
  });
});
