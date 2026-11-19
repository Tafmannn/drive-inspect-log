import { describe, it, expect } from "vitest";
import { resolveJobSourceForSave, jobSourceOptions, jobSourceLabel, isJobSource } from "@/lib/jobSource";

describe("jobSource", () => {
  it("saves known sources and blank as null", () => {
    expect(resolveJobSourceForSave("movex", null)).toBe("movex");
    expect(resolveJobSourceForSave("  ", "movex")).toBeNull();
  });

  it("keeps a legacy value only when it is the job's existing value", () => {
    expect(resolveJobSourceForSave("sheet-import", "sheet-import")).toBe("sheet-import");
    expect(resolveJobSourceForSave("anything", null)).toBeNull();
  });

  it("offers a legacy value so editing never silently drops it", () => {
    expect(jobSourceOptions("sheet-import").at(-1)).toEqual({ value: "sheet-import", label: "sheet-import (legacy)" });
    expect(jobSourceOptions("movex")).toHaveLength(5);
  });

  it("labels values for reports", () => {
    expect(jobSourceLabel(null)).toBe("Not recorded");
    expect(jobSourceLabel("revilo")).toBe("Revilo / Revillo");
    expect(isJobSource("direct")).toBe(true);
  });
});
