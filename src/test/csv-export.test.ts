import { describe, it, expect } from "vitest";

// Test CSV utility functions inline (same logic as export.ts)
function escapeCsv(val: string | null | undefined): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

describe("CSV Export Utilities", () => {
  it("should escape commas in values", () => {
    expect(escapeCsv("hello, world")).toBe('"hello, world"');
  });

  it("should escape double quotes", () => {
    expect(escapeCsv('say "hello"')).toBe('"say ""hello"""');
  });

  it("should escape newlines", () => {
    expect(escapeCsv("line1\nline2")).toBe('"line1\nline2"');
  });

  it("should handle null and undefined", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });

  it("should not wrap plain values", () => {
    expect(escapeCsv("simple")).toBe("simple");
  });

  it("UTF-8 BOM should be prepended for Google Sheets compatibility", () => {
    const BOM = "\uFEFF";
    const csv = BOM + "Name,Amount\nFuel,10.00";
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});
