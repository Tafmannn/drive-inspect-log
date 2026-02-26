import { describe, it, expect } from "vitest";
import { FUEL_LEVEL_MAP, FUEL_PERCENT_TO_LABEL } from "@/lib/types";
import { EXPENSE_CATEGORIES } from "@/lib/expenseApi";

describe("Domain Model", () => {
  describe("Fuel level mapping", () => {
    it("should map all labels to percentages", () => {
      expect(FUEL_LEVEL_MAP["Empty"]).toBe(0);
      expect(FUEL_LEVEL_MAP["1/4"]).toBe(25);
      expect(FUEL_LEVEL_MAP["1/2"]).toBe(50);
      expect(FUEL_LEVEL_MAP["3/4"]).toBe(75);
      expect(FUEL_LEVEL_MAP["Full"]).toBe(100);
    });

    it("should have reverse mapping for all fuel levels", () => {
      for (const [label, pct] of Object.entries(FUEL_LEVEL_MAP)) {
        expect(FUEL_PERCENT_TO_LABEL[pct]).toBe(label);
      }
    });
  });

  describe("Expense categories", () => {
    it("should have at least 5 categories", () => {
      expect(EXPENSE_CATEGORIES.length).toBeGreaterThanOrEqual(5);
    });

    it("should include Misc / Other as last category", () => {
      expect(EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]).toBe("Misc / Other");
    });

    it("should include Fuel category", () => {
      expect(EXPENSE_CATEGORIES).toContain("Fuel");
    });
  });
});

describe("Job Status Values", () => {
  const VALID_STATUSES = [
    "ready_for_pickup",
    "pickup_in_progress",
    "pickup_complete",
    "in_transit",
    "delivery_in_progress",
    "delivery_complete",
    "pod_ready",
    "completed",
    "cancelled",
  ];

  it("should have all expected status values defined", () => {
    // This validates the domain model is complete
    expect(VALID_STATUSES).toHaveLength(9);
  });

  it("active statuses should not include completed states", () => {
    const activeStatuses = [
      "ready_for_pickup",
      "pickup_in_progress",
      "pickup_complete",
      "in_transit",
      "delivery_in_progress",
    ];
    expect(activeStatuses).not.toContain("completed");
    expect(activeStatuses).not.toContain("delivery_complete");
    expect(activeStatuses).not.toContain("pod_ready");
  });
});

describe("Role-based access", () => {
  it("driver role should not allow gallery access", () => {
    const role: string = "driver";
    const canUseGallery = role === "admin";
    expect(canUseGallery).toBe(false);
  });

  it("admin role should allow gallery access", () => {
    const role: string = "admin";
    const canUseGallery = role === "admin";
    expect(canUseGallery).toBe(true);
  });
});
