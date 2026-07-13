/**
 * WORKFLOW-003 + UI-002 regression for InspectionFlow.
 *
 * WORKFLOW-003: nothing previously checked that the current driver is the
 * job's *assigned* driver before allowing inspection actions — confirmed
 * server-side too (submit_inspection read driver_id only to check for a
 * *different* active job lock, never to authorise the caller). Any active
 * driver in the org could open any other driver's job and submit a full
 * inspection against it.
 *
 * UI-002: useJob's query throws for an invalid/inaccessible job id rather
 * than resolving to null. Every field in the form is read via `job?.`, so
 * without a check the driver would sail through the entire multi-step flow
 * before discovering the problem only at final submit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>(
    "@/context/AuthContext",
  );
  return { ...actual, useAuth: () => mockUseAuth() };
});

const mockUseJob = vi.fn();
vi.mock("@/hooks/useJobs", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useJobs")>("@/hooks/useJobs");
  return { ...actual, useJob: () => mockUseJob() };
});

const mockUseDriverGate = vi.fn();
vi.mock("@/hooks/useDriverGate", () => ({
  useDriverGate: () => mockUseDriverGate(),
}));

import { InspectionFlow } from "@/pages/InspectionFlow";

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    external_job_number: "AX0001",
    status: "ready_for_pickup",
    vehicle_reg: "AB12CDE",
    driver_id: "driver-profile-assigned",
    inspections: [],
    photos: [],
    has_pickup_inspection: false,
    has_delivery_inspection: false,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderFlow() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/inspection/job-1/pickup"]}>
        <Routes>
          <Route path="/inspection/:jobId/:inspectionType" element={<InspectionFlow />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("InspectionFlow guards", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ canUseGallery: false, user: { id: "u1" } });
  });

  it('shows "Job not found" for an invalid/inaccessible job id, not an eternal spinner', () => {
    mockUseJob.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockUseDriverGate.mockReturnValue({
      status: "active", driverProfileId: "driver-profile-assigned", onboardingStatus: null, isDriverOnly: true,
    });
    renderFlow();
    expect(screen.getByText("Job not found")).toBeInTheDocument();
  });

  it('blocks a driver from a job assigned to someone else with "Not your job"', () => {
    mockUseJob.mockReturnValue({ data: job({ driver_id: "someone-elses-profile-id" }), isLoading: false, isError: false });
    mockUseDriverGate.mockReturnValue({
      status: "active", driverProfileId: "driver-profile-assigned", onboardingStatus: null, isDriverOnly: true,
    });
    renderFlow();
    expect(screen.getByText("Not your job")).toBeInTheDocument();
    expect(screen.queryByText(/Odometer/i)).not.toBeInTheDocument();
  });

  it("blocks a driver from an unassigned job", () => {
    mockUseJob.mockReturnValue({ data: job({ driver_id: null }), isLoading: false, isError: false });
    mockUseDriverGate.mockReturnValue({
      status: "active", driverProfileId: "driver-profile-assigned", onboardingStatus: null, isDriverOnly: true,
    });
    renderFlow();
    expect(screen.getByText("Not your job")).toBeInTheDocument();
  });

  it("allows the assigned driver through", () => {
    mockUseJob.mockReturnValue({ data: job({ driver_id: "driver-profile-assigned" }), isLoading: false, isError: false });
    mockUseDriverGate.mockReturnValue({
      status: "active", driverProfileId: "driver-profile-assigned", onboardingStatus: null, isDriverOnly: true,
    });
    renderFlow();
    expect(screen.queryByText("Not your job")).not.toBeInTheDocument();
    expect(screen.queryByText("Job not found")).not.toBeInTheDocument();
  });

  it("never blocks an admin regardless of job assignment — useDriverGate reports ungated", () => {
    mockUseJob.mockReturnValue({ data: job({ driver_id: "someone-elses-profile-id" }), isLoading: false, isError: false });
    mockUseDriverGate.mockReturnValue({
      status: "ungated", driverProfileId: null, onboardingStatus: null, isDriverOnly: false,
    });
    renderFlow();
    expect(screen.queryByText("Not your job")).not.toBeInTheDocument();
  });
});
