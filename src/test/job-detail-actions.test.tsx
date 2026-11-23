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
const podPerm = { value: true };
vi.mock("@/hooks/useCanViewPod", () => ({ useCanViewPod: () => podPerm.value }));
vi.mock("@/hooks/useSafeBack", () => ({ useSafeBack: () => () => {} }));
vi.mock("@/hooks/useEvidenceOverrides", () => ({
  useEvidenceOverrides: () => ({ acknowledgedCodes: [], acknowledge: vi.fn(), unacknowledge: vi.fn() }),
}));
vi.mock("@/components/EvidenceStatusBadges", () => ({ EvidenceStatusBadges: () => null }));
// Abort request (driver): the data layer is stubbed; the button's own states are tested below.
const abortState: { pending: null | { requested_at: string }; requestAbort: ReturnType<typeof vi.fn> } = {
  pending: null,
  requestAbort: vi.fn(),
};
vi.mock("@/features/abort/hooks/useAbort", () => ({
  useDriverAbortRequest: () => ({ data: abortState.pending, isLoading: false }),
  useRequestAbort: () => ({ mutateAsync: abortState.requestAbort, isPending: false, isError: false, error: null }),
}));
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

  it("hides every POD button when the user's View PODs permission is off", () => {
    podPerm.value = false;
    try {
      mockJob = makeJob({ status: "pod_ready", has_pickup_inspection: true, has_delivery_inspection: true });
      renderDetail();
      expect(screen.queryByRole("button", { name: /view pod/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /pod report/i })).toBeNull();
    } finally {
      podPerm.value = true;
    }
  });

  it("shows the blocked reason and no primary CTA for a blocked job", () => {
    // "draft" is blocked but not a closed status; cancelled/archived/completed
    // show drivers the "Job closed" screen instead (see tests below).
    mockJob = makeJob({ status: "draft" });
    renderDetail();
    expect(screen.getByText(/blocked — not actionable/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /start pickup/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /view pod/i })).toBeNull();
  });

  it("shows the locked screen to drivers for a completed job", () => {
    mockJob = makeJob({ status: "completed", has_pickup_inspection: true, has_delivery_inspection: true });
    renderDetail();
    expect(screen.getByText("Job completed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /view pod/i })).toBeNull();
  });

  it("shows 'Job closed' to drivers for an archived job", () => {
    mockJob = makeJob({ status: "archived" });
    renderDetail();
    expect(screen.getByText("Job closed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /start pickup/i })).toBeNull();
  });

  it("renders inspections as read-only status, not action buttons", () => {
    renderDetail();
    // Two "Pending" status pills (pickup + delivery), no Start/Override in the section.
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(2);
  });

  it("offers a one-tap Request Abort to the driver on an eligible job", async () => {
    abortState.pending = null;
    abortState.requestAbort = vi.fn().mockResolvedValue({ requestId: "r1", duplicate: false });
    renderDetail();
    const btn = screen.getByRole("button", { name: /request abort/i });
    btn.click();
    expect(abortState.requestAbort).toHaveBeenCalledTimes(1);
    // The job is unchanged: the normal next step is still there.
    expect(screen.getByRole("button", { name: /start pickup/i })).toBeTruthy();
  });

  it("shows the pending request instead of the button, and keeps the job active", () => {
    abortState.pending = { requested_at: "2026-11-23T14:05:00Z" };
    try {
      renderDetail();
      expect(screen.getByText("Abort requested")).toBeTruthy();
      expect(screen.getByText(/23 Nov 2026, 14:05 GMT/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /request abort/i })).toBeNull();
      expect(screen.getByRole("button", { name: /start pickup/i })).toBeTruthy();
    } finally {
      abortState.pending = null;
    }
  });

  it("does not offer Request Abort once the vehicle has been collected", () => {
    mockJob = makeJob({ status: "pickup_complete", has_pickup_inspection: true });
    renderDetail();
    expect(screen.queryByRole("button", { name: /request abort/i })).toBeNull();
  });

  it("shows drivers 'Job aborted' and no actions once an admin has confirmed the Abort", () => {
    mockJob = makeJob({ status: "aborted" });
    renderDetail();
    expect(screen.getByText("Job aborted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /start pickup/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /request abort/i })).toBeNull();
  });
});
