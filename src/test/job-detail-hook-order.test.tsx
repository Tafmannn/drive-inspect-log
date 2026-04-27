/**
 * JobDetail — hook-order regression test.
 *
 * Reproduces the loading → loaded transition that previously triggered
 * "Rendered more hooks than during the previous render" when
 * useEvidenceOverrides was called *after* the early return for
 * `isLoading || !job`.
 *
 * If the hook ordering ever regresses (any new hook is added below the
 * loading early return), React will throw on the second render and this
 * test fails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Hoisted state for the mocked useJob hook ────────────────────────
const jobState: { data: any; isLoading: boolean } = {
  data: null,
  isLoading: true,
};

// ── Mocks ───────────────────────────────────────────────────────────
vi.mock("@/hooks/useJobs", () => ({
  useJob: () => ({ data: jobState.data, isLoading: jobState.isLoading }),
  useActiveJobs: () => ({ data: [] }),
  useDeleteJob: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useAdminChangeStatus: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useExpenses", () => ({
  useJobExpenses: () => ({ data: [] }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ isAdmin: true, isSuperAdmin: false, user: { id: "u1" } }),
}));

vi.mock("@/hooks/useSafeBack", () => ({
  useSafeBack: () => () => {},
}));

vi.mock("@/components/BottomNav", () => ({ BottomNav: () => null }));
vi.mock("@/components/AppHeader", () => ({
  AppHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/components/DashboardSkeleton", () => ({
  DashboardSkeleton: () => <div data-testid="loading-skeleton" />,
}));
vi.mock("@/components/PhotoViewer", () => ({ PhotoViewer: () => null }));
vi.mock("@/components/QrDisplayModal", () => ({ QrDisplayModal: () => null }));
vi.mock("@/components/EvidenceStatusBadges", () => ({ EvidenceStatusBadges: () => null }));
vi.mock("@/components/PricingSuggestionPanel", () => ({ PricingSuggestionPanel: () => null }));
vi.mock("@/components/PricingAuditTimeline", () => ({ PricingAuditTimeline: () => null }));
vi.mock("@/features/jobs/components/JobAdminControls", () => ({
  JobAdminControls: () => null,
}));
vi.mock("@/lib/qrApi", () => ({
  createQrConfirmation: vi.fn(),
  getQrConfirmationsForJob: vi.fn().mockResolvedValue([]),
  buildQrUrl: () => "",
}));
vi.mock("@/lib/mediaResolver", () => ({
  resolveMediaUrlAsync: vi.fn().mockResolvedValue(null),
}));

import { JobDetail } from "@/pages/JobDetail";

function renderJobDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/jobs/job-123"]}>
        <Routes>
          <Route path="/jobs/:jobId" element={<JobDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sampleJob = {
  id: "job-123",
  external_job_number: "AX1234",
  status: "assigned",
  driver_id: "drv-1",
  vehicle_reg: "AB12 CDE",
  make: "Ford",
  model: "Focus",
  colour: "Blue",
  year: 2022,
  pickup_address_line1: "1 A St",
  pickup_address_line2: null,
  pickup_city: "London",
  pickup_postcode: "E1 1AA",
  delivery_address_line1: "2 B St",
  delivery_address_line2: null,
  delivery_city: "Leeds",
  delivery_postcode: "LS1 1AA",
  has_pickup_inspection: false,
  has_delivery_inspection: false,
  inspections: [],
  photos: [],
  current_run_id: null,
  earliest_delivery_date: null,
  caz_ulez_flag: null,
};

describe("JobDetail — hook-order stability", () => {
  beforeEach(() => {
    jobState.data = null;
    jobState.isLoading = true;
  });

  it("does not throw when transitioning loading → loaded (hook order stable)", async () => {
    // Capture React's invariant errors so a hook-order mismatch surfaces
    // even if React only logs (some envs swallow throws inside render).
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender, getByTestId, queryByTestId } = renderJobDetail();
    expect(getByTestId("loading-skeleton")).toBeTruthy();

    // Flip to "loaded" — this is the exact transition that previously
    // produced "Rendered more hooks than during the previous render"
    // because useEvidenceOverrides sat below the early return.
    await act(async () => {
      jobState.data = sampleJob;
      jobState.isLoading = false;
      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={["/jobs/job-123"]}>
            <Routes>
              <Route path="/jobs/:jobId" element={<JobDetail />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    expect(queryByTestId("loading-skeleton")).toBeNull();

    const hookOrderError = errorSpy.mock.calls.find((args) =>
      args.some(
        (a) => typeof a === "string" && /Rendered (more|fewer) hooks/i.test(a),
      ),
    );
    expect(hookOrderError, "React reported a hook-order mismatch").toBeUndefined();

    errorSpy.mockRestore();
  });
});
