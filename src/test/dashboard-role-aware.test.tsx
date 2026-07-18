// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The operational body is heavy (many admin hooks) and lazy-loaded; stub it so
// this test isolates Dashboard's role-routing decision. KpiPill now lives in
// its own module — stub it there.
vi.mock("@/pages/AdminDashboard", () => ({
  AdminDashboardBody: () => <div>OPERATIONAL_BODY</div>,
}));
vi.mock("@/components/KpiPill", () => ({
  KpiPill: ({ label }: { label: string }) => <div>PILL:{label}</div>,
}));

let mockAuth = { user: { name: "Terry Tapfumaneyi" }, isAdmin: false, isSuperAdmin: false };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mockAuth }));

let mockGate = { isDriverOnly: true, status: "active", driverProfileId: "d1" };
vi.mock("@/hooks/useDriverGate", () => ({ useDriverGate: () => mockGate }));

vi.mock("@/hooks/useJobs", () => ({
  useDashboardCounts: () => ({
    data: { myJobs: 2, pendingUploads: 0, completedLast14Days: 5 },
    isLoading: false,
  }),
}));

import { Dashboard } from "@/pages/Dashboard";

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard role-aware home", () => {
  beforeEach(() => {
    mockAuth = { user: { name: "Terry Tapfumaneyi" }, isAdmin: false, isSuperAdmin: false };
    mockGate = { isDriverOnly: true, status: "active", driverProfileId: "d1" };
  });

  it("shows the operational body to an admin, not the driver launcher", async () => {
    mockAuth = { user: { name: "Amy Admin" }, isAdmin: true, isSuperAdmin: false };
    mockGate = { isDriverOnly: false, status: "ungated", driverProfileId: null } as any;
    renderDashboard();
    expect(await screen.findByText("OPERATIONAL_BODY")).toBeTruthy();
    expect(screen.queryByText("Expenses")).toBeNull();
  });

  it("shows the operational body to a super-admin", async () => {
    mockAuth = { user: { name: "Sam Super" }, isAdmin: true, isSuperAdmin: true };
    mockGate = { isDriverOnly: false, status: "ungated", driverProfileId: null } as any;
    renderDashboard();
    expect(await screen.findByText("OPERATIONAL_BODY")).toBeTruthy();
  });

  it("shows the compact launcher (stat pills + Expenses) to a driver", () => {
    renderDashboard();
    expect(screen.getByText("PILL:Active")).toBeTruthy();
    expect(screen.getByText("PILL:Uploads")).toBeTruthy();
    expect(screen.getByText("PILL:Completed")).toBeTruthy();
    expect(screen.getByText("Expenses")).toBeTruthy();
    expect(screen.queryByText("OPERATIONAL_BODY")).toBeNull();
    // No card duplicating a bottom-nav destination.
    expect(screen.queryByText("Control Center")).toBeNull();
    expect(screen.queryByText("My Jobs")).toBeNull();
  });

  it("greets the user by first name in the page heading", () => {
    renderDashboard();
    // The page H1 is the greeting, not a redundant "Dashboard" label.
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/, Terry$/);
  });
});
