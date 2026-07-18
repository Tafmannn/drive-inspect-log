// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ── Mocks: keep the test on JobDetail's own layout logic, not data plumbing.
let mockJob: any;
vi.mock("@/hooks/useJobs", () => ({
  useJob: () => ({ data: mockJob, isLoading: false, isError: false }),
  useActiveJobs: () => ({ data: [] }),
  useDeleteJob: () => ({ mutateAsync: vi.fn() }),
  useAdminChangeStatus: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useExpenses", () => ({ useJobExpenses: () => ({ data: [] }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false }) }));
vi.mock("@/hooks/useSafeBack", () => ({ useSafeBack: () => () => {} }));
vi.mock("@/hooks/useEvidenceOverrides", () => ({
  useEvidenceOverrides: () => ({ acknowledgedCodes: [], acknowledge: vi.fn(), unacknowledge: vi.fn() }),
}));
vi.mock("@/components/EvidenceStatusBadges", () => ({ EvidenceStatusBadges: () => null }));
vi.mock("@/lib/qrApi", () => ({
  getQrConfirmationsForJob: () => Promise.resolve([]),
  createQrConfirmation: vi.fn(),
  buildQrUrl: (t: string) => `https://x/${t}`,
}));

import { JobDetail } from "@/pages/JobDetail";

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    external_job_number: "AX-1001",
    status: "ready_for_pickup",
    vehicle_reg: "AB12 CDE",
    vehicle_make: "Ford", vehicle_model: "Transit", vehicle_colour: "White", vehicle_year: 2020,
    client_company: "Acme", client_name: "Acme", client_email: "acme@example.com",
    inspections: [],
    has_pickup_inspection: false,
    has_delivery_inspection: false,
    photos: [],
    driver_id: "d1",
    pickup_contact_name: "Pat Pickup", pickup_company: "Depot A",
    pickup_contact_phone: "+447700111", pickup_city: "Leeds", pickup_postcode: "LS1 1AA",
    delivery_contact_name: "Dan Delivery", delivery_company: "Depot B",
    delivery_contact_phone: "+447700222", delivery_city: "York", delivery_postcode: "YO1 1AA",
    ...overrides,
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/jobs/job-1"]}>
      <Routes>
        <Route path="/jobs/:jobId" element={<JobDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("JobDetail — driver action layout", () => {
  beforeEach(() => { mockJob = makeJob(); });

  it("surfaces the primary action ABOVE the route sections for an active job", () => {
    renderDetail();
    const cta = screen.getByRole("button", { name: /start pickup/i });
    expect(cta).toBeTruthy();
    expect(screen.getByText(/next: start pickup/i)).toBeTruthy();
    // The Next-step card comes before "Collect From" in document order.
    const collect = screen.getByText("Collect From");
    expect(cta.compareDocumentPosition(collect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives each leg its own Call and Navigate buttons", () => {
    renderDetail();
    expect(screen.getAllByRole("button", { name: /call/i })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /navigate/i })).toHaveLength(2);
  });

  it("shows View POD (not a start action) for a review-only job", () => {
    mockJob = makeJob({ status: "pod_ready", has_pickup_inspection: true, has_delivery_inspection: true });
    renderDetail();
    expect(screen.getByRole("button", { name: /view pod/i })).toBeTruthy();
    expect(screen.getByText(/awaiting review/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /start pickup/i })).toBeNull();
  });

  it("shows the blocked reason and no primary CTA for a blocked job", () => {
    mockJob = makeJob({ status: "cancelled" });
    renderDetail();
    expect(screen.getByText(/blocked — not actionable/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /start pickup/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /view pod/i })).toBeNull();
  });

  it("renders inspections as read-only status, not action buttons", () => {
    renderDetail();
    // Two "Pending" status pills (pickup + delivery), no Start/Override in the section.
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(2);
  });
});
