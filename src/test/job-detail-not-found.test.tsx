/**
 * `useJob`'s query throws (Supabase `.single()` with zero matching rows —
 * either a genuinely invalid id, or one RLS silently denies) rather than
 * resolving to null. JobDetail previously destructured only `{ data, isLoading }`
 * and rendered `isLoading || !job` as its sole loading/error condition, so once
 * the query settled into its error state (isLoading: false, data: undefined) the
 * component kept showing the loading skeleton forever — with no indication the
 * job doesn't exist or isn't accessible, and no way out other than the header's
 * always-present back button.
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

import { JobDetail } from "@/pages/JobDetail";

function renderJobDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/jobs/nonexistent-job-id"]}>
        <Routes>
          <Route path="/jobs/:jobId" element={<JobDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("JobDetail not-found / inaccessible state", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ isAdmin: false, isSuperAdmin: false });
  });

  it('shows "Job not found" once the query settles into its error state, not an eternal skeleton', () => {
    mockUseJob.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderJobDetail();
    expect(screen.getByText("Job not found")).toBeInTheDocument();
    expect(screen.getByText("Back to Jobs")).toBeInTheDocument();
  });

  it("shows the loading skeleton (not the not-found state) while the query is in flight", () => {
    mockUseJob.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderJobDetail();
    expect(screen.queryByText("Job not found")).not.toBeInTheDocument();
  });

  it("renders neither loading nor not-found once real job data arrives", () => {
    mockUseJob.mockReturnValue({
      data: {
        id: "job-1",
        external_job_number: "AX0001",
        status: "ready_for_pickup",
        vehicle_reg: "AB12CDE",
        inspections: [],
        photos: [],
        has_pickup_inspection: false,
        has_delivery_inspection: false,
      },
      isLoading: false,
      isError: false,
    });
    renderJobDetail();
    expect(screen.queryByText("Job not found")).not.toBeInTheDocument();
  });
});
