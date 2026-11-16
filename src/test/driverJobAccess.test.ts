import { describe, it, expect } from "vitest";
import { isJobLockedForDriver } from "@/lib/driverJobAccess";

const driver = { isAdmin: false, isSuperAdmin: false };

describe("isJobLockedForDriver", () => {
  it("locks completed (POD-approved) jobs for drivers", () => {
    expect(isJobLockedForDriver("completed", driver)).toBe(true);
  });
  it("does not lock in-flight or pending-review jobs for drivers", () => {
    for (const s of ["assigned", "in_transit", "delivery_complete", "pod_ready"]) {
      expect(isJobLockedForDriver(s, driver)).toBe(false);
    }
  });
  it("never locks for admins or super-admins", () => {
    expect(isJobLockedForDriver("completed", { isAdmin: true, isSuperAdmin: false })).toBe(false);
    expect(isJobLockedForDriver("completed", { isAdmin: false, isSuperAdmin: true })).toBe(false);
  });
});
