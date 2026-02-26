import { describe, it, expect } from "vitest";
import { FUEL_LEVEL_MAP, FUEL_PERCENT_TO_LABEL } from "@/lib/types";
import { EXPENSE_CATEGORIES } from "@/lib/expenseApi";
import { hasRoleCheck, isAdminDriverCheck, type AppUser, type AppRole } from "@/context/AuthContext";

function makeUser(roles: AppRole[]): AppUser {
  return { id: "test", name: "Test", email: "t@t.com", roles, status: "active" };
}

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

describe("Multi-role system", () => {
  it("DRIVER cannot access admin features", () => {
    const user = makeUser(["DRIVER"]);
    expect(hasRoleCheck(user, "ADMIN")).toBe(false);
    expect(hasRoleCheck(user, "DRIVER")).toBe(true);
  });

  it("ADMIN has admin access", () => {
    const user = makeUser(["ADMIN"]);
    expect(hasRoleCheck(user, "ADMIN")).toBe(true);
    expect(hasRoleCheck(user, "DRIVER")).toBe(false);
  });

  it("ADMIN+DRIVER hybrid has both roles", () => {
    const user = makeUser(["ADMIN", "DRIVER"]);
    expect(hasRoleCheck(user, "ADMIN")).toBe(true);
    expect(hasRoleCheck(user, "DRIVER")).toBe(true);
    expect(isAdminDriverCheck(user)).toBe(true);
  });

  it("SUPERADMIN has all roles implicitly", () => {
    const user = makeUser(["SUPERADMIN"]);
    expect(hasRoleCheck(user, "ADMIN")).toBe(true);
    expect(hasRoleCheck(user, "DRIVER")).toBe(true);
    expect(hasRoleCheck(user, "SUPERADMIN")).toBe(true);
  });

  it("gallery access only for admin/superadmin", () => {
    expect(hasRoleCheck(makeUser(["DRIVER"]), "ADMIN")).toBe(false);
    expect(hasRoleCheck(makeUser(["ADMIN"]), "ADMIN")).toBe(true);
    expect(hasRoleCheck(makeUser(["SUPERADMIN"]), "ADMIN")).toBe(true);
  });

  it("isAdminDriver is false for single-role users", () => {
    expect(isAdminDriverCheck(makeUser(["DRIVER"]))).toBe(false);
    expect(isAdminDriverCheck(makeUser(["ADMIN"]))).toBe(false);
  });
});
