// @vitest-environment jsdom
// Page tests for the merged Jobs and POD Review screens (phone layout: jsdom
// has no matchMedia, so ResponsiveList renders cards).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  listStatus: vi.fn(),
  ack: vi.fn(async () => {}),
  confirm: vi.fn(async () => true),
  complete: vi.fn(async () => ({})),
  invalidateQueues: vi.fn(),
}));

function job(id: string, o: Record<string, unknown> = {}) {
  return {
    id, external_job_number: `AX${id}`, vehicle_reg: `REG${id}`, vehicle_make: "Ford", vehicle_model: "Focus",
    status: "in_transit", driver_id: "d1", driver_name: null, resolvedDriverName: "Sam",
    pickup_city: "Leeds", pickup_postcode: "LS1", delivery_city: "York", delivery_postcode: "YO1",
    job_date: "2026-11-17", updated_at: new Date().toISOString(), priority: null, completed_at: null,
    client_company: "Acme", client_name: null, has_pickup_inspection: true, has_delivery_inspection: false,
    ...o,
  };
}

vi.mock("@/hooks/useAdminJobQueues", () => ({
  useAdminJobQueues: () => ({
    data: {
      needsAttention: [job("1", { resolvedDriverName: null, driver_id: null })],
      unassigned: [],
      inProgress: [job("2")],
      review: [],
      completed: [],
      missingEvidence: [job("3", { vehicle_reg: "EVID3" })],
      truncated: true,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/features/control/hooks/useControlJobsData", async (orig) => {
  const actual: Record<string, unknown> = await orig();
  return {
    ...actual,
    useControlJobs: (f: { status: string }) => {
      h.listStatus(f.status);
      return { data: [job("9", { vehicle_reg: "LIST9" })], isLoading: false, error: null, refetch: vi.fn() };
    },
    useJobsKpis: () => ({ data: { active: 7, podReview: 2, unassigned: 1, stale: 3, total: 40 }, isLoading: false }),
  };
});

vi.mock("@/hooks/useEvidenceAckRealtime", () => ({ useEvidenceAckRealtime: () => {} }));
vi.mock("@/lib/evidenceAckApi", () => ({ acknowledgeMissingEvidence: h.ack }));
vi.mock("@/lib/mutationEvents", () => ({ invalidateAdminOperationalQueues: h.invalidateQueues, invalidateForEvent: vi.fn() }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => h.confirm }));
vi.mock("@/features/control/components/RunOrderModal", () => ({
  RunOrderModal: ({ open }: { open: boolean }) => (open ? <div>run-order-open</div> : null),
}));
vi.mock("@/features/control/components/AssignDriverModal", () => ({
  AssignDriverModal: ({ jobRef }: { jobRef: string }) => <div>assign {jobRef}</div>,
}));

const closure = (id: string, o: Record<string, unknown>) => ({
  ...job(id), status: "pod_ready", band: "review_queue", missingPickupInspection: false,
  missingDeliveryInspection: false, isStale: false, hasCustomerSignature: true, hasDriverSignature: true,
  evidence: "complete", has_delivery_inspection: true, ...o,
});

vi.mock("@/features/control/hooks/useClosureReview", async (orig) => {
  const actual: Record<string, unknown> = await orig();
  return {
    ...actual,
    useClosureReviewQueue: () => ({
      data: {
        queue: [
          closure("a", { vehicle_reg: "NOINSP", evidence: "missing_inspection", missingDeliveryInspection: true, has_delivery_inspection: false, status: "delivery_complete" }),
          closure("b", { vehicle_reg: "NOSIG", evidence: "missing_signatures", hasCustomerSignature: false }),
          closure("c", { vehicle_reg: "READY" }),
        ],
        recentlyCompleted: [closure("d", { vehicle_reg: "DONE", status: "completed", band: "recently_completed" })],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useClosureKpis: () => ({
      data: { reviewQueue: 3, podReady: 2, deliveryComplete: 1, completedRecent: 1, missingDeliveryInspection: 1 },
      isLoading: false,
    }),
  };
});

vi.mock("@/lib/api", () => ({ completeJobRpc: h.complete }));

import { ControlJobs } from "@/features/control/pages/ControlJobs";
import { ControlPodReview } from "@/features/control/pages/ControlPodReview";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderAt(url: string, path: string, page: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={path} element={<>{page}<Probe /></>} />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const loc = () => screen.getByTestId("loc").textContent;

beforeEach(() => vi.clearAllMocks());

describe("Jobs screen", () => {
  it("opens on the triage queues with the truncation warning", () => {
    renderAt("/control/jobs", "/control/jobs", <ControlJobs />);
    for (const name of ["Needs attention", "Unassigned", "Missing evidence", "In progress", "POD review", "Recently completed"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/most recently updated 300 jobs/i)).toBeInTheDocument();
  });

  it("translates an old ?filter= link and shows that view", () => {
    renderAt("/control/jobs?filter=in_progress", "/control/jobs", <ControlJobs />);
    expect(loc()).toBe("/control/jobs?view=active");
    expect(h.listStatus).toHaveBeenLastCalledWith("active");
    expect(screen.getByText("LIST9")).toBeInTheDocument();
  });

  it("KPI tiles switch the view (and the URL)", () => {
    renderAt("/control/jobs", "/control/jobs", <ControlJobs />);
    fireEvent.click(screen.getByRole("button", { name: /^evidence gaps:/i }));
    expect(loc()).toBe("/control/jobs?view=evidence");
    fireEvent.click(screen.getByRole("button", { name: /^stale \(>24h\):/i }));
    expect(loc()).toBe("/control/jobs?view=stale");
    expect(h.listStatus).toHaveBeenLastCalledWith("stale");
  });

  it("Mark resolved asks first, records the acknowledgement and refreshes the queues", async () => {
    renderAt("/control/jobs?view=evidence", "/control/jobs", <ControlJobs />);
    const section = screen.getByRole("region", { name: "Missing evidence" });
    fireEvent.click(within(section).getByRole("button", { name: /mark resolved/i }));
    await waitFor(() => expect(h.ack).toHaveBeenCalledWith("3"));
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.invalidateQueues).toHaveBeenCalled();
  });

  it("does nothing when the confirmation is cancelled", async () => {
    h.confirm.mockResolvedValueOnce(false);
    renderAt("/control/jobs?view=evidence", "/control/jobs", <ControlJobs />);
    fireEvent.click(screen.getByRole("button", { name: /mark resolved/i }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.ack).not.toHaveBeenCalled();
  });

  it("search filters the queues and is kept in the URL", () => {
    renderAt("/control/jobs", "/control/jobs", <ControlJobs />);
    fireEvent.change(screen.getByRole("textbox", { name: /search jobs/i }), { target: { value: "evid" } });
    expect(loc()).toBe("/control/jobs?search=evid");
    expect(screen.getByText("EVID3")).toBeInTheDocument();
    expect(screen.queryByText("REG2")).not.toBeInTheDocument();
  });

  it("Run order and assign are available on the merged screen", () => {
    renderAt("/control/jobs", "/control/jobs", <ControlJobs />);
    fireEvent.click(screen.getByRole("button", { name: /set driver run order/i }));
    expect(screen.getByText("run-order-open")).toBeInTheDocument();
    const attention = screen.getByRole("region", { name: "Needs attention" });
    fireEvent.click(within(attention).getByRole("button", { name: /^assign$/i }));
    expect(screen.getByText("assign AX1")).toBeInTheDocument();
  });

  it("opening a job carries a way back to the same view", () => {
    renderAt("/control/jobs?view=evidence", "/control/jobs", <ControlJobs />);
    fireEvent.click(screen.getByText("EVID3"));
    expect(loc()).toBe("/jobs/3?from=%2Fcontrol%2Fjobs%3Fview%3Devidence");
  });
});

describe("POD review screen", () => {
  it("groups the queue by evidence, with recently completed collapsed", () => {
    renderAt("/control/pod-review", "/control/pod-review", <ControlPodReview />);
    expect(within(screen.getByRole("region", { name: "Missing delivery inspection" })).getByText("NOINSP")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Missing signatures" })).getByText("NOSIG")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Ready to confirm" })).getByText("READY")).toBeInTheDocument();
    expect(screen.queryByText("DONE")).not.toBeInTheDocument();
  });

  it("shows signature gaps on the card", () => {
    renderAt("/control/pod-review", "/control/pod-review", <ControlPodReview />);
    const sig = screen.getByRole("region", { name: "Missing signatures" });
    expect(within(sig).getByText(/no customer sig/i)).toBeInTheDocument();
  });

  it("Confirm completes the job through the server RPC", async () => {
    renderAt("/control/pod-review?view=ready", "/control/pod-review", <ControlPodReview />);
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    await waitFor(() => expect(h.complete).toHaveBeenCalledWith("c", "Confirmed via POD review"));
  });

  it("Inspect is offered only where the delivery inspection is missing", () => {
    renderAt("/control/pod-review", "/control/pod-review", <ControlPodReview />);
    expect(screen.getAllByRole("button", { name: /^inspect$/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^inspect$/i }));
    expect(loc()).toBe("/inspection/a/delivery");
  });

  it("KPI tiles switch the view", () => {
    renderAt("/control/pod-review", "/control/pod-review", <ControlPodReview />);
    fireEvent.click(screen.getByRole("button", { name: /^missing signatures:/i }));
    expect(loc()).toBe("/control/pod-review?view=missing_signatures");
    expect(screen.getByText("NOSIG")).toBeInTheDocument();
    expect(screen.queryByText("READY")).not.toBeInTheDocument();
  });
});
