import { describe, it, expect } from "vitest";

// The driver roster search (merged Drivers screen): name, display name,
// phone, trade plate, licence number or latest job reg, case-insensitively.
import { matchesDriverSearch } from "@/features/control/hooks/useControlDriversData";

interface Row {
  display_name: string | null;
  full_name: string;
  phone: string | null;
  latestJobReg: string | null;
  licence_number: string | null;
  trade_plate_number: string | null;
}

function matches(rows: Row[], search: string): Row[] {
  return rows.filter((r) => matchesDriverSearch(r, search));
}

const rows: Row[] = [
  { display_name: "Alice Brown", full_name: "Alice Brown", phone: "+447700111", latestJobReg: "AB12 CDE", licence_number: "BROWN901", trade_plate_number: null },
  { display_name: "Bob Green", full_name: "Robert Green", phone: "+447700222", latestJobReg: "XY99 ZZZ", licence_number: null, trade_plate_number: "123 TP" },
  { display_name: "Carol White", full_name: "Carol White", phone: null, latestJobReg: null, licence_number: "WHITE123", trade_plate_number: null },
];

describe("driver roster search", () => {
  it("returns everything for an empty query", () => {
    expect(matches(rows, "")).toHaveLength(3);
    expect(matches(rows, "   ")).toHaveLength(3);
  });

  it("matches on name case-insensitively", () => {
    expect(matches(rows, "alice")).toHaveLength(1);
    expect(matches(rows, "GREEN")).toHaveLength(1);
  });

  it("matches on the full name even when the display name differs", () => {
    expect(matches(rows, "robert")[0].display_name).toBe("Bob Green");
  });

  it("matches on phone, plate and licence number", () => {
    expect(matches(rows, "0222")).toHaveLength(1);
    expect(matches(rows, "ab12")).toHaveLength(1);
    expect(matches(rows, "white123")).toHaveLength(1);
  });

  it("matches on trade plate", () => {
    expect(matches(rows, "123 tp")).toHaveLength(1);
  });

  it("tolerates null fields without throwing", () => {
    expect(() => matches(rows, "carol")).not.toThrow();
    expect(matches(rows, "carol")).toHaveLength(1);
  });
});
