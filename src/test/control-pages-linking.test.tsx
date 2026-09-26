// @vitest-environment jsdom
// KPI tiles and table rows on the Control Centre pages must do something:
// filter the list they summarise, or open the record they describe.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

const drivers = vi.hoisted(() => ({ filter: vi.fn() }));

vi.mock("@/features/control/hooks/useControlDriversData", async (orig) => {
  const actual: any = await orig();
  return {
    ...actual,
    useControlDrivers: (_search: string, filter: string) => {
      drivers.filter(filter);
      return {
        data: [
          {
            id: "dp1", user_id: "user-1", full_name: "Sam Driver", display_name: null, phone: null,
            is_active: true, licence_expiry: null, trade_plate_number: "TP1", employment_type: null,
            created_at: "2026-01-01T00:00:00Z", activeJobCount: 0, latestJobReg: null,
            latestJobStatus: null, hasStaleJob: false, workloadLinkType: null,
          },
        ],
        isLoading: false,
        error: null,
      };
    },
    useDriversKpis: () => ({
      data: { total: 5, active: 4, licenceExpiring: 1, missingPlate: 2 },
      isLoading: false,
    }),
  };
});

vi.mock("@/features/control/hooks/useSuperAdminControlData", () => ({
  useSuperAdminKpis: () => ({ data: { totalOrgs: 3, totalUsers: 12, activeJobs: 7, auditEventsToday: 4 }, isLoading: false }),
  useOrganisations: () => ({ data: [{ id: "org-1", name: "Acme Movers", created_at: "2026-01-01T00:00:00Z" }], isLoading: false }),
  useRecentAuditLogs: () => ({
    data: [{ id: "a1", created_at: "2026-09-01T00:00:00Z", performed_by_email: "boss@x.test", action: "org_update", after_state: null, target_org_id: "org-2" }],
    isLoading: false,
  }),
  useRecentErrors: () => ({
    data: [
      { id: "e1", created_at: "2026-09-01T00:00:00Z", severity: "error", event: "upload_failed", message: "boom", job_id: "job-9" },
      { id: "e2", created_at: "2026-09-01T00:00:00Z", severity: "warn", event: "orphan_warn", message: "hmm", job_id: null },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/features/attention/hooks/useAttentionData", () => ({
  useAttentionData: () => ({ data: { exceptions: [], acknowledgedCount: 0 }, isLoading: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("@/features/attention/components/AttentionQueue", () => ({ AttentionQueue: () => null }));

import { ControlDrivers } from "@/features/control/pages/ControlDrivers";
import { ControlSuperAdmin } from "@/features/control/pages/ControlSuperAdmin";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname + loc.search}</div>;
}

function renderAt(path: string, page: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<>{page}<LocationProbe /></>} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

const loc = () => screen.getByTestId("location").textContent;

describe("ControlDrivers linking", () => {
  it("KPI tiles apply the matching roster filter", () => {
    renderAt("/control/drivers", <ControlDrivers />);
    fireEvent.click(screen.getByRole("button", { name: /missing trade plate/i }));
    expect(drivers.filter).toHaveBeenLastCalledWith("missing-plate");
    fireEvent.click(screen.getByRole("button", { name: /licence expiring \(30d\)/i }));
    expect(drivers.filter).toHaveBeenLastCalledWith("licence-expiring");
  });

  it("roster rows open the driver profile", () => {
    renderAt("/control/drivers", <ControlDrivers />);
    fireEvent.click(screen.getByText("Sam Driver"));
    expect(loc()).toBe("/admin/drivers/user-1");
  });
});

describe("ControlSuperAdmin linking", () => {
  it("KPI tiles link to their management pages", () => {
    renderAt("/control/super-admin", <ControlSuperAdmin />);
    const hrefOf = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(hrefOf(/organisations/i)).toBe("/super-admin/orgs");
    expect(hrefOf(/total users/i)).toBe("/super-admin/users");
    expect(hrefOf(/active jobs/i)).toBe("/control/jobs?status=active");
    expect(hrefOf(/platform exceptions/i)).toBe("/super-admin/attention");
    expect(hrefOf(/audit events/i)).toBe("/super-admin/audit");
  });

  it("Export Report is enabled and opens Exports", () => {
    renderAt("/control/super-admin", <ControlSuperAdmin />);
    const btn = screen.getByRole("button", { name: /export report/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(loc()).toBe("/control/exports");
  });

  it("organisation rows open the organisation profile", () => {
    renderAt("/control/super-admin", <ControlSuperAdmin />);
    fireEvent.click(screen.getByText("Acme Movers"));
    expect(loc()).toBe("/super-admin/orgs/org-1");
  });

  it("audit rows open the targeted organisation", () => {
    renderAt("/control/super-admin", <ControlSuperAdmin />);
    fireEvent.click(screen.getByText("boss@x.test"));
    expect(loc()).toBe("/super-admin/orgs/org-2");
  });

  it("error rows open the job when linked, else the error feed", () => {
    const { unmount } = renderAt("/control/super-admin", <ControlSuperAdmin />);
    fireEvent.click(screen.getByText("upload_failed"));
    expect(loc()).toBe("/jobs/job-9?from=/control/super-admin");
    unmount();

    renderAt("/control/super-admin", <ControlSuperAdmin />);
    fireEvent.click(screen.getByText("orphan_warn"));
    expect(loc()).toBe("/super-admin/errors");
  });
});
