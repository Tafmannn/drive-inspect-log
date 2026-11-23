// @vitest-environment jsdom
/**
 * Completed jobs are record-only for drivers, and the "View PODs" (pod.view)
 * permission is honoured. Covers JobCard's readOnly mode, the locked screen,
 * the permission hook, and the driver views of Last 14 Days / Pending Jobs /
 * POD report.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  auth: { user: { id: "u1" } as { id: string } | null, isAdmin: false, isSuperAdmin: false },
  gate: { isDriverOnly: true, driverProfileId: "d1", status: "active" },
  canViewPod: true,
  jobs: [] as unknown[],
  job: null as unknown,
  rpc: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("@/hooks/useDriverGate", () => ({ useDriverGate: () => state.gate }));
vi.mock("@/hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("@/hooks/useJobs", () => ({
  useCompletedJobs: () => ({ data: state.jobs, isLoading: false, isError: false, refetch: () => {} }),
  usePendingJobs: () => ({ data: state.jobs, isLoading: false, isError: false, refetch: () => {} }),
  useJob: () => ({ data: state.job, isLoading: false }),
  useUpdateJob: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useExpenses", () => ({ useJobExpenses: () => ({ data: [] }) }));
vi.mock("@/hooks/useSafeBack", () => ({ useSafeBack: () => () => {} }));
vi.mock("@/hooks/useEvidenceOverrides", () => ({
  useEvidenceOverrides: () => ({ acknowledgedCodes: [], acknowledge: vi.fn(), unacknowledge: vi.fn() }),
}));

// useCanViewPod is mocked for the page tests and imported for real (via
// importActual) in its own describe block below.
vi.mock("@/hooks/useCanViewPod", async (importActual) => {
  const actual = await importActual<typeof import("@/hooks/useCanViewPod")>();
  return { ...actual, useCanViewPod: () => state.canViewPod, realUseCanViewPod: actual.useCanViewPod };
});

import { JobCard } from "@/components/JobCard";
import { DriverJobLocked } from "@/components/DriverJobLocked";
import { CompletedJobs } from "@/pages/CompletedJobs";
import { PendingJobs } from "@/pages/PendingJobs";
import { PodReport } from "@/pages/PodReport";
import * as canViewPodModule from "@/hooks/useCanViewPod";

const realUseCanViewPod = (canViewPodModule as unknown as {
  realUseCanViewPod: () => boolean;
}).realUseCanViewPod;

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    external_job_number: "AX-1",
    vehicle_reg: "AB12 CDE",
    status: "completed",
    driver_id: "d1",
    pickup_address_line1: "1 Pickup St", pickup_city: "Leeds", pickup_postcode: "LS1 1AA",
    delivery_address_line1: "2 Drop Rd", delivery_city: "York", delivery_postcode: "YO1 1AA",
    pickup_contact_phone: "+447700111", delivery_contact_phone: "+447700222",
    has_pickup_inspection: true,
    has_delivery_inspection: true,
    inspections: [], photos: [], damage_items: [],
    ...overrides,
  };
}

function inRouter(ui: ReactNode, path = "/", entry = "/") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={path} element={ui} />
        <Route path="*" element={<div data-testid="navigated" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.auth = { user: { id: "u1" }, isAdmin: false, isSuperAdmin: false };
  state.gate = { isDriverOnly: true, driverProfileId: "d1", status: "active" };
  state.canViewPod = true;
  state.jobs = [];
  state.job = null;
  state.rpc.mockReset();
});
afterEach(() => cleanup());

// ── JobCard readOnly ────────────────────────────────────────────────

describe("JobCard readOnly", () => {
  const route = { pickupAddress: "1 Pickup St", deliveryAddress: "2 Drop Rd", pickupPhone: "+44", deliveryPhone: "+45" };

  it("renders no actions, no map links and ignores taps", () => {
    const onCardClick = vi.fn();
    render(
      <JobCard reg="AB12 CDE" jobRef="AX-1" status="completed" route={route}
        hasPickupInspection hasDeliveryInspection ctaLabel="View POD"
        onCardClick={onCardClick} readOnly />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("1 Pickup St")).toBeTruthy();
    fireEvent.click(screen.getByText("Job AX-1"));
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("keeps the CTA, navigate button, map links and tap-through when not readOnly", () => {
    const onCardClick = vi.fn();
    render(
      <JobCard reg="AB12 CDE" jobRef="AX-1" status="in_transit" route={route}
        hasPickupInspection hasDeliveryInspection={false} onCardClick={onCardClick} />,
    );
    expect(screen.getByRole("button", { name: /start delivery/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /navigate/i })).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    fireEvent.click(screen.getByText("Job AX-1"));
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });
});

// ── DriverJobLocked ─────────────────────────────────────────────────

describe("DriverJobLocked", () => {
  it("shows the completed message by default and goes back to Last 14 Days", () => {
    inRouter(<DriverJobLocked title="Job Detail" />);
    expect(screen.getByText("Job completed")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /back to last 14 days/i }));
    expect(screen.getByTestId("navigated")).toBeTruthy();
  });

  it("accepts a custom heading, message and back target", () => {
    inRouter(
      <DriverJobLocked title="POD Report" heading="POD not available" message="No access."
        backTo="/jobs/job-1" backLabel="Back to job" />,
    );
    expect(screen.getByText("POD not available")).toBeTruthy();
    expect(screen.getByText("No access.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /back to job/i }));
    expect(screen.getByTestId("navigated")).toBeTruthy();
  });
});

// ── useCanViewPod (real implementation) ─────────────────────────────

describe("useCanViewPod", () => {
  function wrapper({ children }: { children: ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }

  it("is always true for admins without querying", () => {
    state.auth = { user: { id: "u1" }, isAdmin: true, isSuperAdmin: false };
    const { result } = renderHook(() => realUseCanViewPod(), { wrapper });
    expect(result.current).toBe(true);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("reads the driver's effective pod.view permission", async () => {
    state.rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => realUseCanViewPod(), { wrapper });
    expect(result.current).toBe(false); // fails closed while loading
    await waitFor(() => expect(result.current).toBe(true));
    expect(state.rpc).toHaveBeenCalledWith("user_has_permission", {
      p_user_id: "u1",
      p_permission_key: "pod.view",
    });
  });

  it("is false when the permission is denied", async () => {
    state.rpc.mockResolvedValue({ data: false, error: null });
    const { result } = renderHook(() => realUseCanViewPod(), { wrapper });
    await waitFor(() => expect(state.rpc).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it("fails closed when the lookup errors", async () => {
    state.rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    const { result } = renderHook(() => realUseCanViewPod(), { wrapper });
    await waitFor(() => expect(state.rpc).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});

// ── Last 14 Days ────────────────────────────────────────────────────

describe("CompletedJobs", () => {
  it("drivers get a record-only card with no POD, navigate or call", () => {
    state.jobs = [job()];
    inRouter(<CompletedJobs />);
    expect(screen.getByText("Job AX-1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /view pod/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /navigate/i })).toBeNull();
    fireEvent.click(screen.getByText("Job AX-1"));
    expect(screen.queryByTestId("navigated")).toBeNull();
  });

  it("admins keep View POD", () => {
    state.gate = { isDriverOnly: false, driverProfileId: null as unknown as string, status: "ungated" };
    state.jobs = [job({ driver_id: "someone-else" })];
    inRouter(<CompletedJobs />);
    fireEvent.click(screen.getByRole("button", { name: /view pod/i }));
    expect(screen.getByTestId("navigated")).toBeTruthy();
  });
});

// ── Pending Jobs ────────────────────────────────────────────────────

describe("PendingJobs", () => {
  it("shows View Job instead of View POD when the permission is off", () => {
    state.canViewPod = false;
    state.jobs = [job({ status: "pod_ready" })];
    inRouter(<PendingJobs />);
    expect(screen.queryByRole("button", { name: /view pod/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /view job/i }));
    expect(screen.getByTestId("navigated")).toBeTruthy();
  });

  it("shows View POD when the permission is on", () => {
    state.jobs = [job({ status: "pod_ready" })];
    inRouter(<PendingJobs />);
    expect(screen.getByRole("button", { name: /view pod/i })).toBeTruthy();
  });
});

// ── POD report ──────────────────────────────────────────────────────

describe("PodReport access", () => {
  function renderPod() {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/jobs/job-1/pod"]}>
          <Routes>
            <Route path="/jobs/:jobId/pod" element={<PodReport />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("locks a completed job for drivers", () => {
    state.job = job();
    renderPod();
    expect(screen.getByText("Job completed")).toBeTruthy();
  });

  it("refuses an aborted POD even to admins on a direct link", () => {
    state.auth = { user: { id: "u1" }, isAdmin: true, isSuperAdmin: false };
    state.job = job({ status: "aborted", has_pickup_inspection: false, has_delivery_inspection: false });
    renderPod();
    expect(screen.getByText("POD not applicable — collection aborted")).toBeTruthy();
    expect(screen.queryByText("Proof of Delivery")).toBeNull();
    expect(screen.getByRole("button", { name: /Back to job/i })).toBeTruthy();
  });

  it("blocks drivers without the View PODs permission", () => {
    state.canViewPod = false;
    state.job = job({ status: "pod_ready" });
    renderPod();
    expect(screen.getByText("POD not available")).toBeTruthy();
  });
});
