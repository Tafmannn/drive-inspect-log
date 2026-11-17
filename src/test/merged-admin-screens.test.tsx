// @vitest-environment jsdom
// The paired /admin (mobile) and /control (desktop) screens were merged into
// one /control screen per area. These tests pin the view/URL rules, the
// legacy-link redirects and the rules the merged screens took from each side.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import {
  resolveJobsView, jobsViewUrl, legacyAdminJobsTarget, matchesJobSearch,
} from "@/features/control/pages/jobs/jobsView";
import { resolvePodView, podViewUrl, canConfirmReview } from "@/features/control/pages/pod/podView";
import {
  evidenceState, buildSignatureMap, selectClosureRows,
  type ClosureReviewRow, type ClosureReviewData,
} from "@/features/control/hooks/useClosureReview";
import { resolveDriverFilter } from "@/features/control/hooks/useControlDriversData";
import { receiptCompliancePct } from "@/features/control/lib/financeBreakdown";
import { legacyAdminTarget } from "@/features/control/legacyAdminTarget";
import { AdminJobsRedirect, LegacyAdminRedirect } from "@/features/control/LegacyAdminRedirects";
import { BUCKET_DEFS } from "@/lib/operationsBuckets";

const qs = (s: string) => new URLSearchParams(s);

describe("Jobs views", () => {
  it("defaults to the triage queues", () => {
    expect(resolveJobsView(qs(""))).toBe("queues");
    expect(resolveJobsView(qs("view=nonsense"))).toBe("queues");
  });

  it("reads ?view= first", () => {
    expect(resolveJobsView(qs("view=evidence&status=active"))).toBe("evidence");
  });

  it("translates old desktop ?status= values", () => {
    expect(resolveJobsView(qs("status=pod_review"))).toBe("review");
    expect(resolveJobsView(qs("status=all"))).toBe("all");
    expect(resolveJobsView(qs("status=stale"))).toBe("stale");
  });

  it("translates old mobile ?filter= values", () => {
    expect(resolveJobsView(qs("filter=all"))).toBe("queues");
    expect(resolveJobsView(qs("filter=in_progress"))).toBe("active");
    expect(resolveJobsView(qs("filter=driver"))).toBe("active");
    expect(resolveJobsView(qs("filter=evidence"))).toBe("evidence");
    expect(resolveJobsView(qs("filter=cancelled"))).toBe("cancelled");
  });

  it("builds canonical URLs and keeps the search as typed", () => {
    expect(jobsViewUrl("queues")).toBe("/control/jobs");
    expect(jobsViewUrl("active", "  ")).toBe("/control/jobs?view=active");
    expect(jobsViewUrl("stale", "ford focus")).toBe("/control/jobs?view=stale&search=ford+focus");
  });

  it("sends old /admin/jobs links to the matching view", () => {
    expect(legacyAdminJobsTarget(qs("filter=unassigned"))).toBe("/control/jobs?view=unassigned");
    expect(legacyAdminJobsTarget(qs(""))).toBe("/control/jobs");
  });

  it("searches reg, ref, client, driver, cities and postcodes", () => {
    const row = {
      vehicle_reg: "AB12 CDE", external_job_number: "AX0070", client_company: "Acme",
      resolvedDriverName: "Sam", pickup_city: "Leeds", delivery_postcode: "M1 1AA",
    };
    for (const term of ["ab12", "ax00", "acme", "sam", "leeds", "m1 1"]) {
      expect(matchesJobSearch(row, term)).toBe(true);
    }
    expect(matchesJobSearch(row, "zzz")).toBe(false);
    expect(matchesJobSearch(row, "  ")).toBe(true);
  });
});

function closureRow(o: Partial<ClosureReviewRow>): ClosureReviewRow {
  return {
    id: "x", status: "pod_ready", band: "review_queue", updated_at: new Date().toISOString(),
    has_delivery_inspection: true, has_pickup_inspection: true,
    missingDeliveryInspection: false, missingPickupInspection: false, isStale: false,
    hasCustomerSignature: true, hasDriverSignature: true, evidence: "complete",
    ...o,
  } as ClosureReviewRow;
}

describe("POD review", () => {
  it("evidence: no inspection, then missing signatures, then complete", () => {
    expect(evidenceState({ has_delivery_inspection: false, hasCustomerSignature: true, hasDriverSignature: true })).toBe("missing_inspection");
    expect(evidenceState({ has_delivery_inspection: true, hasCustomerSignature: false, hasDriverSignature: true })).toBe("missing_signatures");
    expect(evidenceState({ has_delivery_inspection: true, hasCustomerSignature: true, hasDriverSignature: false })).toBe("missing_signatures");
    expect(evidenceState({ has_delivery_inspection: true, hasCustomerSignature: true, hasDriverSignature: true })).toBe("complete");
  });

  it("signatures come from the latest delivery inspection; blank URLs don't count", () => {
    const map = buildSignatureMap([
      { job_id: "j1", customer_signature_url: "a.png", driver_signature_url: "b.png", inspected_at: "2026-11-01T10:00:00Z", created_at: null },
      { job_id: "j1", customer_signature_url: "  ", driver_signature_url: "c.png", inspected_at: "2026-11-02T10:00:00Z", created_at: null },
      { job_id: "j2", customer_signature_url: "a.png", driver_signature_url: null, inspected_at: null, created_at: "2026-11-01T00:00:00Z" },
    ]);
    expect(map.j1).toEqual({ customer: false, driver: true });
    expect(map.j2).toEqual({ customer: true, driver: false });
  });

  it("the three evidence groups partition the review queue", () => {
    const data: ClosureReviewData = {
      queue: [
        closureRow({ id: "a", evidence: "missing_inspection", missingDeliveryInspection: true, has_delivery_inspection: false }),
        closureRow({ id: "b", evidence: "missing_signatures", hasCustomerSignature: false }),
        closureRow({ id: "c", evidence: "complete" }),
      ],
      recentlyCompleted: [closureRow({ id: "d", status: "completed", band: "recently_completed" })],
    };
    const ids = (f: Parameters<typeof selectClosureRows>[1]) => selectClosureRows(data, f).map((r) => r.id);
    expect(ids("missing_delivery_inspection")).toEqual(["a"]);
    expect(ids("missing_signatures")).toEqual(["b"]);
    expect(ids("ready")).toEqual(["c"]);
    expect([...ids("missing_delivery_inspection"), ...ids("missing_signatures"), ...ids("ready")].sort()).toEqual(ids("all").sort());
    expect(ids("all")).not.toContain("d");
  });

  it("views: ?view=, old ?filter= band names, and canonical URLs", () => {
    expect(resolvePodView(qs(""))).toBe("all");
    expect(resolvePodView(qs("view=ready"))).toBe("ready");
    expect(resolvePodView(qs("filter=missing_inspection"))).toBe("missing_delivery_inspection");
    expect(resolvePodView(qs("filter=completed"))).toBe("recently_completed");
    expect(podViewUrl("all")).toBe("/control/pod-review");
    expect(podViewUrl("missing_signatures", "ab1")).toBe("/control/pod-review?view=missing_signatures&search=ab1");
  });

  it("Confirm is offered only on closure-stage jobs", () => {
    expect(canConfirmReview({ status: "pod_ready" })).toBe(true);
    expect(canConfirmReview({ status: "delivery_complete" })).toBe(true);
    expect(canConfirmReview({ status: "completed" })).toBe(false);
    expect(canConfirmReview({ status: "in_transit" })).toBe(false);
  });
});

describe("Finance and Drivers rules kept from the mobile pages", () => {
  it("receipt compliance %", () => {
    expect(receiptCompliancePct(0, 0)).toBe(100);
    expect(receiptCompliancePct(4, 5)).toBe(80);
    expect(receiptCompliancePct(2, 3)).toBe(67);
  });

  it("driver filters accept the old /admin/drivers names", () => {
    expect(resolveDriverFilter("with-jobs")).toBe("with-workload");
    expect(resolveDriverFilter("no-jobs")).toBe("no-workload");
    expect(resolveDriverFilter("missing-plate")).toBe("missing-plate");
    expect(resolveDriverFilter("bogus")).toBe("all");
    expect(resolveDriverFilter(null)).toBe("all");
  });
});

describe("Old /admin links", () => {
  it("map to the merged /control pages", () => {
    expect(legacyAdminTarget("finance", qs("filter=ready"))).toBe("/control/invoice-prep");
    expect(legacyAdminTarget("finance", qs("filter=uninvoiced"))).toBe("/control/invoice-prep");
    expect(legacyAdminTarget("finance", qs(""))).toBe("/control/finance");
    expect(legacyAdminTarget("drivers", qs("filter=with-jobs"))).toBe("/control/drivers?filter=with-jobs");
    expect(legacyAdminTarget("pod-review", qs(""))).toBe("/control/pod-review");
  });

  it("no dashboard bucket points at a retired page or a missing route", () => {
    for (const def of Object.values(BUCKET_DEFS)) {
      if (!def.defaultRoute) continue;
      expect(def.defaultRoute).not.toMatch(/^\/admin\/(jobs|pod-review|finance|drivers)\b/);
      expect(def.defaultRoute).not.toMatch(/^\/uploads\b/);
    }
  });

  function Probe() {
    const l = useLocation();
    return <div data-testid="loc">{l.pathname + l.search}</div>;
  }

  it.each([
    ["/admin/jobs?filter=evidence", <AdminJobsRedirect />, "/control/jobs?view=evidence"],
    ["/admin/pod-review", <LegacyAdminRedirect area="pod-review" />, "/control/pod-review"],
    ["/admin/finance?filter=ready", <LegacyAdminRedirect area="finance" />, "/control/invoice-prep"],
    ["/admin/drivers?filter=no-jobs", <LegacyAdminRedirect area="drivers" />, "/control/drivers?filter=no-jobs"],
  ])("%s redirects", (from, element, to) => {
    const path = from.split("?")[0];
    render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("loc").textContent).toBe(to);
  });
});
