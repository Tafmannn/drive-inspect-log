import { describe, it, expect } from "vitest";
import { EMPLOYMENT_TYPES } from "@/lib/driverProfileConstants";

// Mirrors the live driver_profiles_employment_type_check constraint
// (`employment_type = ANY (ARRAY['employed','contractor','agency','self_employed'])`).
// A value drifting from this set 500s any save that touches employment_type —
// this happened twice independently (UserDetailEditor, AdminOnboarding) before
// the dropdowns were consolidated onto this shared constant.
const DB_ALLOWED_VALUES = ["employed", "contractor", "agency", "self_employed"];

describe("EMPLOYMENT_TYPES", () => {
  it("matches the driver_profiles_employment_type_check constraint exactly", () => {
    const values = EMPLOYMENT_TYPES.map((t) => t.value);
    expect(values.sort()).toEqual([...DB_ALLOWED_VALUES].sort());
  });

  it("has no duplicate values", () => {
    const values = EMPLOYMENT_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
