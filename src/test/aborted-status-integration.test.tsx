// @vitest-environment jsdom
/** The collection Abort is closed, not a delivery or POD milestone. */
import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Job } from "@/lib/types";
import { deriveJobSummary } from "@/lib/driverJobSummary";
import { JobCard } from "@/components/JobCard";

afterEach(() => cleanup());

describe("aborted state integration", () => {
  it("is a non-actionable terminal driver job, never a View POD CTA or late pickup", () => {
    const j = {
      id: "job-1",
      status: "aborted",
      driver_id: "driver-1",
      external_job_number: "AX-1",
      vehicle_reg: "AB12 CDE",
      job_date: "2020-01-01",
      pickup_time_to: "09:00",
      pickup_contact_name: "Depot",
      pickup_contact_phone: "07000000000",
      pickup_address_line1: "One Street",
      pickup_city: "Leeds",
      pickup_postcode: "LS1 1AA",
      delivery_contact_name: "Dealer",
      delivery_contact_phone: "07000000000",
      delivery_address_line1: "Two Street",
      delivery_city: "York",
      delivery_postcode: "YO1 1AA",
      has_pickup_inspection: false,
      has_delivery_inspection: false,
    } as unknown as Job;
    const s = deriveJobSummary(j, false, [j]);
    expect(s.workflow_state).toBe("terminal");
    expect(s.action_state).toBe("view_job");
    expect(s.primary_cta).toEqual({ label: "View Job", route: "/jobs/job-1" });
    expect(s.priority_state).toBe("blocked");
    expect(s.recommendation_reason).toBe("Collection aborted");
  });

  it("never labels a missing-pickup aborted card Start Pickup", () => {
    render(
      <JobCard
        reg="AB12 CDE"
        jobRef="AX-1"
        status="aborted"
        route={{ pickupAddress: "Leeds", deliveryAddress: "York" }}
        hasPickupInspection={false}
        hasDeliveryInspection={false}
      />,
    );
    expect(screen.getByRole("button", { name: /View Job/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start Pickup/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /View POD/i })).toBeNull();
  });

  it("does not allow a direct POD route or evidence-health completion banner on an aborted job", () => {
    // Regression tripwires around the route-level guards. The pure domain
    // checks above test executable behaviour; these check the UI entry points.
    const pod = readFileSync(resolve(process.cwd(), "src/pages/PodReport.tsx"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "src/pages/JobDetail.tsx"), "utf8");
    const podAbortGuard = pod.indexOf('if (job.status === "aborted")');
    expect(podAbortGuard).toBeGreaterThan(0);
    expect(podAbortGuard).toBeLessThan(pod.indexOf("const ref = job.external_job_number"));
    expect(pod).toContain("POD not applicable — collection aborted");
    expect(detail).toContain("Evidence Health — Not applicable (Aborted)");
    expect(detail).toContain("Not required — collection aborted before handover");
    expect(detail).toContain("!isAborted && canViewPod");
  });
});
