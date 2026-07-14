import { describe, it, expect } from "vitest";
import { buildCategorySlices, capSlices, OTHER_LABEL } from "@/features/control/lib/financeBreakdown";

describe("buildCategorySlices", () => {
  it("groups rows by category, summing amount and counting occurrences", () => {
    const slices = buildCategorySlices([
      { category: "Fuel", amount: 10 },
      { category: "Fuel", amount: 5.5 },
      { category: "Parking", amount: 3 },
    ]);
    expect(slices).toEqual([
      { category: "Fuel", amount: 15.5, count: 2, color: "#2a78d6" },
      { category: "Parking", amount: 3, count: 1, color: "#eda100" },
    ]);
  });

  it("sorts descending by amount", () => {
    const slices = buildCategorySlices([
      { category: "Parking", amount: 3 },
      { category: "Fuel", amount: 15 },
    ]);
    expect(slices.map((s) => s.category)).toEqual(["Fuel", "Parking"]);
  });

  it("falls back to Uncategorised for blank category", () => {
    const slices = buildCategorySlices([{ category: "", amount: 4 }]);
    expect(slices[0].category).toBe("Uncategorised");
  });
});

describe("capSlices", () => {
  function slice(category: string, amount: number) {
    return { category, amount, count: 1, color: "#2a78d6" };
  }

  it("passes through unchanged when 5 or fewer named categories", () => {
    const input = [slice("Fuel", 10), slice("Tolls", 5)];
    expect(capSlices(input)).toEqual(input);
  });

  it("folds categories past the top 5 into a single Other slice", () => {
    const input = [
      { category: "Fuel", amount: 10, count: 1, color: "#2a78d6" },
      { category: "Tolls", amount: 9, count: 1, color: "#1baf7a" },
      { category: "Parking", amount: 8, count: 1, color: "#eda100" },
      { category: "Congestion/ULEZ/CAZ", amount: 7, count: 1, color: "#008300" },
      { category: "Car Wash / Valet", amount: 6, count: 1, color: "#4a3aa7" },
      { category: "Maintenance / Tyres", amount: 5, count: 1, color: "#e34948" },
      { category: "Accommodation", amount: 4, count: 1, color: "#e87ba4" },
    ];
    const result = capSlices(input);
    expect(result).toHaveLength(6);
    expect(result[5].category).toBe(OTHER_LABEL);
    expect(result[5].amount).toBe(5 + 4); // Maintenance/Tyres + Accommodation overflow
    expect(result[5].count).toBe(2);
    // total is preserved exactly across the fold
    const totalBefore = input.reduce((sum, s) => sum + s.amount, 0);
    const totalAfter = result.reduce((sum, s) => sum + s.amount, 0);
    expect(totalAfter).toBe(totalBefore);
  });

  it("always folds categories with no dedicated hue into Other, even if they'd otherwise rank in the top 5", () => {
    const input = [
      { category: "Misc / Other", amount: 100, count: 1, color: "#898781" },
      { category: "Fuel", amount: 1, count: 1, color: "#2a78d6" },
    ];
    const result = capSlices(input);
    expect(result.map((s) => s.category)).toEqual(["Fuel", OTHER_LABEL]);
    expect(result.find((s) => s.category === OTHER_LABEL)?.amount).toBe(100);
  });

  it("returns an empty array for no input", () => {
    expect(capSlices([])).toEqual([]);
  });
});
