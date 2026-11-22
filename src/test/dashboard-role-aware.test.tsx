// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

// The driver's "Up next" card reads the same ranked summaries as My Jobs.
let mockSummaries: Array<Record<string, unknown>> = [];
vi.mock("@/features/driver/useDriverJobSummaries", () => ({
  useDriverJobSummaries: () => ({ summaries: mockSummaries, isLoading: false, isError: false, refetch: () => {}, isDriverOnly: true }),
}));
vi.mock("@/components/DriverJobCard", () => ({
  DriverJobCard: ({ summary, onPrimaryAction }: { summary: { job_ref: string }; onPrimaryAction: () => void }) => (
    <button onClick={onPrimaryAction}>CARD:{summary.job_ref}</button>
  ),
}));
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { Dashboard } from "@/pages/Dashboard";
import { adminGreeting } from "@/features/admin-home/greeting";

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
    mockSummaries = [];
    mockNavigate.mockReset();
  });

  it("a driver sees the recommended next job, with its real action, before any stats", () => {
    mockSummaries = [
      { job_id: "a", job_ref: "AX-1", priority_state: "queued", primary_cta: { route: "/jobs/a" } },
      { job_id: "b", job_ref: "AX-2", priority_state: "recommended_now", primary_cta: { route: "/inspection/b/pickup" } },
      { job_id: "c", job_ref: "AX-3", priority_state: "queued", primary_cta: { route: "/jobs/c" } },
    ];
    const { container } = renderDashboard();
    const card = screen.getByText("CARD:AX-2");
    const firstPill = screen.getByText("PILL:Active");
    // card precedes the stat row in document order
    expect(card.compareDocumentPosition(firstPill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/2 more jobs/)).toBeTruthy();
    fireEvent.click(card);
    expect(mockNavigate).toHaveBeenCalledWith("/inspection/b/pickup");
    expect(container.textContent).not.toMatch(/AX-1|AX-3/);
  });

  it("a driver with no jobs sees an honest empty state", () => {
    renderDashboard();
    expect(screen.getByText("No jobs assigned")).toBeTruthy();
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

  it("admin greeting stays one line: capitalises a handle, drops a long name", () => {
    expect(adminGreeting("Simon Jones", 15)).toBe("Good afternoon, Simon");
    expect(adminGreeting("jsmith", 9)).toBe("Good morning, Jsmith");
    expect(adminGreeting("terrytapfumaneyi1987", 20)).toBe("Good evening");
    expect(adminGreeting(undefined, 20)).toBe("Good evening");
  });
});
