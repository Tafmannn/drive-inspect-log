import { describe, it, expect } from "vitest";
import {
  selectClosureRows,
  type ClosureReviewData,
  type ClosureReviewRow,
} from "./useClosureReview";

function row(overrides: Partial<ClosureReviewRow>): ClosureReviewRow {
  return {
    id: "id",
    external_job_number: null,
    vehicle_reg: null,
    vehicle_make: null,
    vehicle_model: null,
    status: "pod_ready",
    driver_name: null,
    delivery_city: null,
    delivery_postcode: null,
    updated_at: new Date().toISOString(),
    completed_at: null,
    has_pickup_inspection: true,
    has_delivery_inspection: true,
    client_company: null,
    client_name: null,
    pickup_postcode: null,
    driver_id: null,
    resolvedDriverName: null,
    missingPickupInspection: false,
    missingDeliveryInspection: false,
    isStale: false,
    band: "review_queue",
    ...overrides,
  } as ClosureReviewRow;
}

describe("selectClosureRows", () => {
  it("returns [] when data is missing", () => {
    expect(selectClosureRows(undefined, "all")).toEqual([]);
    expect(selectClosureRows(null, "all")).toEqual([]);
  });

  it('excludes recently-completed jobs from the "all" Review Queue view', () => {
    // Regression: everything has been actioned (empty active queue) but there
    // are 7 recently-completed jobs. The Review Queue KPI reads 0, so the list
    // must be empty too — recently-completed jobs must not leak in.
    const data: ClosureReviewData = {
      queue: [],
      recentlyCompleted: Array.from({ length: 7 }, (_, i) =>
        row({ id: `c${i}`, status: "completed", band: "recently_completed" }),
      ),
    };
    expect(selectClosureRows(data, "all")).toEqual([]);
  });

  it('shows only active queue items under "all"', () => {
    const data: ClosureReviewData = {
      queue: [
        row({ id: "a", status: "pod_ready" }),
        row({ id: "b", status: "delivery_complete" }),
      ],
      recentlyCompleted: [row({ id: "c", status: "completed", band: "recently_completed" })],
    };
    expect(selectClosureRows(data, "all").map(r => r.id)).toEqual(["a", "b"]);
  });

  it('"recently_completed" filter surfaces only completed jobs', () => {
    const data: ClosureReviewData = {
      queue: [row({ id: "a", status: "pod_ready" })],
      recentlyCompleted: [row({ id: "c", status: "completed", band: "recently_completed" })],
    };
    expect(selectClosureRows(data, "recently_completed").map(r => r.id)).toEqual(["c"]);
  });

  it("pod_ready / delivery_complete filters narrow the active queue by status", () => {
    const data: ClosureReviewData = {
      queue: [
        row({ id: "a", status: "pod_ready" }),
        row({ id: "b", status: "delivery_complete" }),
      ],
      recentlyCompleted: [],
    };
    expect(selectClosureRows(data, "pod_ready").map(r => r.id)).toEqual(["a"]);
    expect(selectClosureRows(data, "delivery_complete").map(r => r.id)).toEqual(["b"]);
  });

  it("applies the search filter across identity fields", () => {
    const data: ClosureReviewData = {
      queue: [
        row({ id: "a", status: "pod_ready", vehicle_reg: "YC74HGK" }),
        row({ id: "b", status: "delivery_complete", resolvedDriverName: "Terrence" }),
      ],
      recentlyCompleted: [],
    };
    expect(selectClosureRows(data, "all", "yc74").map(r => r.id)).toEqual(["a"]);
    expect(selectClosureRows(data, "all", "terrence").map(r => r.id)).toEqual(["b"]);
    expect(selectClosureRows(data, "all", "nomatch")).toEqual([]);
  });
});
