import { describe, it, expect } from "vitest";
import { rankJobs } from "@/lib/executionRanking";
import type { Job } from "@/lib/types";

/**
 * Admin-set run order (jobs.route_order) must override the automatic
 * within-class heuristics (time windows, route adjacency, job_date) so a
 * driver's list is exactly the sequence the dispatcher arranged.
 */

let seq = 0;
function mkJob(overrides: Partial<Job>): Job {
  seq += 1;
  return {
    id: `job-${seq}`,
    external_job_number: `AX${String(seq).padStart(4, "0")}`,
    status: "assigned",
    vehicle_reg: `REG${seq}`,
    vehicle_make: "Make",
    vehicle_model: "Model",
    vehicle_colour: "Blue",
    pickup_contact_name: "P",
    pickup_contact_phone: "1",
    pickup_address_line1: "1 Street",
    pickup_city: "Glasgow",
    pickup_postcode: "G1 1AA",
    delivery_contact_name: "D",
    delivery_contact_phone: "2",
    delivery_address_line1: "2 Street",
    delivery_city: "Hart",
    delivery_postcode: "GU17 9LG",
    driver_id: "driver-1",
    has_pickup_inspection: false,
    has_delivery_inspection: false,
    completed_at: null,
    created_at: `2026-07-0${(seq % 8) + 1}T10:00:00Z`,
    updated_at: "2026-07-10T10:00:00Z",
    job_date: null,
    pickup_time_from: null,
    ...overrides,
  } as Job;
}

describe("rankJobs with admin route_order", () => {
  it("orders same-class jobs by route_order regardless of heuristics", () => {
    // Without route_order, an earlier pickup_time_from would win; the
    // admin's explicit order must beat it.
    const early = mkJob({ pickup_time_from: "08:00", route_order: 3 });
    const mid = mkJob({ pickup_time_from: "12:00", route_order: 1 });
    const late = mkJob({ pickup_time_from: "16:00", route_order: 2 });

    const ranked = rankJobs([early, mid, late]);
    expect(ranked.map((j) => j.route_order)).toEqual([1, 2, 3]);
  });

  it("sorts ordered jobs ahead of unordered ones, unordered keep heuristics", () => {
    const unorderedEarly = mkJob({ pickup_time_from: "07:00", route_order: null });
    const ordered = mkJob({ pickup_time_from: "15:00", route_order: 1 });

    const ranked = rankJobs([unorderedEarly, ordered]);
    expect(ranked[0].id).toBe(ordered.id);
    expect(ranked[1].id).toBe(unorderedEarly.id);
  });

  it("keeps a job the driver already started ahead of the manual order", () => {
    // current_active class outranks eligible classes — an in-progress job
    // stays on top even if the admin sequenced another job first.
    const inProgress = mkJob({ status: "pickup_in_progress", route_order: 5 });
    const sequencedFirst = mkJob({ status: "assigned", route_order: 1 });

    const ranked = rankJobs([sequencedFirst, inProgress]);
    expect(ranked[0].id).toBe(inProgress.id);
  });

  it("without any route_order the existing heuristics are unchanged", () => {
    const late = mkJob({ pickup_time_from: "16:00", route_order: null });
    const early = mkJob({ pickup_time_from: "08:00", route_order: null });

    const ranked = rankJobs([late, early]);
    expect(ranked[0].id).toBe(early.id);
  });
});
