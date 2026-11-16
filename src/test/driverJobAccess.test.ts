import { describe, it, expect } from "vitest";
import { isJobLockedForDriver, lockedJobHeading } from "@/lib/driverJobAccess";

const driver = { isAdmin: false, isSuperAdmin: false };

describe("isJobLockedForDriver", () => {
  it("locks completed (POD-approved) jobs for drivers", () => {
    expect(isJobLockedForDriver("completed", driver)).toBe(true);
  });
  it("locks cancelled and archived jobs for drivers too", () => {
    expect(isJobLockedForDriver("cancelled", driver)).toBe(true);
    expect(isJobLockedForDriver("archived", driver)).toBe(true);
  });
  it("does not lock a job with no status", () => {
    expect(isJobLockedForDriver(null, driver)).toBe(false);
    expect(isJobLockedForDriver(undefined, driver)).toBe(false);
  });
  it("says 'Job completed' for completed jobs and 'Job closed' otherwise", () => {
    expect(lockedJobHeading("completed")).toBe("Job completed");
    expect(lockedJobHeading("cancelled")).toBe("Job closed");
    expect(lockedJobHeading("archived")).toBe("Job closed");
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

import { withoutPodCta, type DriverJobSummary } from "@/lib/driverJobSummary";

describe("withoutPodCta", () => {
  const base = { job_id: "job-1" } as DriverJobSummary;
  it("replaces a POD CTA with View Job", () => {
    const s = { ...base, primary_cta: { label: "View POD", route: "/jobs/job-1/pod" } } as DriverJobSummary;
    expect(withoutPodCta(s).primary_cta).toEqual({ label: "View Job", route: "/jobs/job-1" });
  });
  it("leaves non-POD CTAs alone", () => {
    const s = { ...base, primary_cta: { label: "Start Pickup", route: "/inspection/job-1/pickup" } } as DriverJobSummary;
    expect(withoutPodCta(s)).toBe(s);
  });
});
