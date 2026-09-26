// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const JOB_A = "11111111-1111-4111-8111-111111111111";
const JOB_B = "22222222-2222-4222-8222-222222222222";
const JOB_C = "33333333-3333-4333-8333-333333333333";

const hooks = vi.hoisted(() => ({
  kpis: vi.fn(),
  missing: vi.fn(),
}));

vi.mock("@/features/control/hooks/useControlComplianceData", async (orig) => {
  const actual: any = await orig();
  const q = (data: unknown) => ({ data, isLoading: false, isError: false, isFetching: false });
  return {
    ...actual,
    useComplianceKpis: (period: string) => {
      hooks.kpis(period);
      return q({ inspectionCount: 113, damageCount: 9, completedCount: 63, nonCompliantCount: 9, complianceRate: 86 });
    },
    useJobsMissingInspections: (period: string) => {
      hooks.missing(period);
      return q([
        { id: JOB_A, vehicle_reg: "AB12 CDE", job_number: "J-100", completed_at: "2026-07-01T10:00:00Z", missing_pickup: false, missing_delivery: true },
      ]);
    },
    useRecentInspections: () =>
      q([
        { id: "i1", type: "pickup", has_damage: false, created_at: "2026-07-17T10:00:00Z", vehicle_reg: "XY34 ZZZ", vehicle_make: "", vehicle_model: "", job_id: JOB_B, job_number: "J-200" },
      ]),
    useDamageReports: () =>
      q([
        { id: "d1", area: "Front", item: "Bumper", damage_types: ["Scratch"], notes: null, created_at: "2026-07-10T10:00:00Z", inspection_id: "i9", inspection_type: "pickup", job_id: JOB_C, vehicle_reg: "DM55 AGE", job_number: "J-300" },
      ]),
  };
});

vi.mock("@/features/attention/hooks/useAttentionData", () => ({
  useAttentionData: () => ({
    data: {
      exceptions: [
        {
          id: "bank-missing:u1",
          severity: "low",
          category: "compliance",
          title: "Bank details not captured",
          detail: "Sam Driver — payout details missing",
          actionLabel: "Open driver",
          actionRoute: "/admin/drivers/u1",
          createdAt: "2026-09-01T00:00:00Z",
        },
      ],
    },
    isLoading: false,
    isError: false,
    isFetching: false,
  }),
}));

import { ControlCompliance } from "@/features/control/pages/ControlCompliance";
import { periodSince, isCompliancePeriod } from "@/features/control/hooks/useControlComplianceData";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderPage(initial = "/control/compliance") {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/control/compliance" element={<><ControlCompliance /><LocationProbe /></>} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("location").textContent;

beforeEach(() => {
  hooks.kpis.mockClear();
  hooks.missing.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("period helpers", () => {
  it("validates periods and computes lower bounds", () => {
    expect(isCompliancePeriod("90d")).toBe(true);
    expect(isCompliancePeriod("bogus")).toBe(false);
    const now = new Date("2026-09-26T00:00:00Z");
    expect(periodSince("all", now)).toBeNull();
    expect(periodSince("30d", now)).toBe("2026-08-27T00:00:00.000Z");
  });
});

describe("ControlCompliance page", () => {
  it("defaults to 12 months so a quiet month doesn't zero every KPI", () => {
    renderPage();
    expect(hooks.kpis).toHaveBeenCalledWith("12m");
    expect(screen.getByText("86%")).toBeTruthy();
    expect(screen.getByText("113")).toBeTruthy();
  });

  it("period selector re-queries with the chosen period", () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Last 90 days" }));
    expect(hooks.kpis).toHaveBeenLastCalledWith("90d");
    expect(hooks.missing).toHaveBeenLastCalledWith("90d");
    expect(loc()).toContain("period=90d");
  });

  it("KPI tiles are buttons that jump to their section", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /compliance rate/i }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("missing-inspection rows open the job, with a back-link to this page", () => {
    renderPage();
    const section = document.getElementById("missing-inspections")!;
    fireEvent.click(within(section).getByText("AB12 CDE"));
    expect(loc()).toBe(`/jobs/${JOB_A}?from=%2Fcontrol%2Fcompliance`);
  });

  it("recent-inspection rows open the job", () => {
    renderPage();
    fireEvent.click(screen.getByText("XY34 ZZZ"));
    expect(loc()).toContain(`/jobs/${JOB_B}?from=`);
  });

  it("damage rows open the job's POD (where the damage photos are)", () => {
    renderPage();
    fireEvent.click(screen.getByText("DM55 AGE"));
    expect(loc()).toContain(`/jobs/${JOB_C}/pod?from=`);
  });

  it("compliance alert rows open the profile that needs fixing", () => {
    renderPage();
    const section = document.getElementById("compliance-alerts")!;
    fireEvent.click(within(section).getByText("Bank details not captured"));
    expect(loc()).toBe("/admin/drivers/u1");
  });

  it("back-link preserves a non-default period", () => {
    renderPage("/control/compliance?period=30d");
    fireEvent.click(screen.getByText("XY34 ZZZ"));
    expect(loc()).toBe(`/jobs/${JOB_B}?from=${encodeURIComponent("/control/compliance?period=30d")}`);
  });
});
