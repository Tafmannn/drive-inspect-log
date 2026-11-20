/**
 * InspectionFlow draft restore, mounted for real (the decision itself is unit
 * tested in mobile-viewport-regressions). Re-opening an inspection in the same
 * tab — in-app back-and-forth, or iOS reloading a backgrounded tab after the
 * camera — used to skip the restore entirely: the form came back empty at
 * step 1 and the autosave then overwrote the saved draft.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>("@/context/AuthContext");
  return { ...actual, useAuth: () => mockUseAuth() };
});

const mockUseJob = vi.fn();
vi.mock("@/hooks/useJobs", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useJobs")>("@/hooks/useJobs");
  return { ...actual, useJob: () => mockUseJob() };
});

const mockUseDriverGate = vi.fn();
vi.mock("@/hooks/useDriverGate", () => ({ useDriverGate: () => mockUseDriverGate() }));

import { InspectionFlow } from "@/pages/InspectionFlow";

const DRAFT_KEY = "axentra.draft.pickup:job-1";
const SESSION_KEY = "axentra.inspection.session.job-1.pickup";

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

function saveDraft(data: Record<string, unknown>, savedAt: string) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, savedAt }));
}

describe("InspectionFlow draft restore", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; // jsdom has no scrolling
    mockUseAuth.mockReturnValue({ canUseGallery: false, user: { id: "u1" } });
    mockUseDriverGate.mockReturnValue({ status: "ungated", driverProfileId: null, onboardingStatus: null, isDriverOnly: false });
    mockUseJob.mockReturnValue({
      data: {
        id: "job-1", external_job_number: "AX0001", status: "ready_for_pickup", vehicle_reg: "AB12CDE",
        driver_id: null, inspections: [], photos: [], has_pickup_inspection: false,
        has_delivery_inspection: false, updated_at: new Date().toISOString(),
      },
      isLoading: false,
      isError: false,
    });
  });

  it("restores the note and step silently when re-opened in the same tab", async () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    saveDraft(
      { odometer: "54321", fuelLevel: "Full", vehicleCondition: "Clean", lightCondition: "Good", numberOfKeys: "2", notes: "Note that must survive", _currentStep: 2 },
      new Date(Date.now() - 3600_000).toISOString(),
    );
    renderFlow();
    expect(await screen.findByText(/Step 2\/6/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Notes")).toHaveValue("Note that must survive");
    expect(screen.queryByText("Resume from draft?")).not.toBeInTheDocument();

    // The autosave must not have overwritten the draft with an empty form.
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY)!).data;
    expect(saved.notes).toBe("Note that must survive");
    expect(saved._currentStep).toBe(2);
  });

  it("asks before resuming a draft from an earlier session", async () => {
    saveDraft({ odometer: "54321", notes: "yesterday", _currentStep: 2 }, new Date(Date.now() - 3600_000).toISOString());
    renderFlow();
    expect(await screen.findByText("Resume from draft?")).toBeInTheDocument();
  });

  it("starts each new step at the top of the page", async () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    saveDraft(
      { odometer: "1", fuelLevel: "Full", vehicleCondition: "Clean", lightCondition: "Good", numberOfKeys: "2", _currentStep: 3 },
      new Date().toISOString(),
    );
    const scrollTo = vi.mocked(window.scrollTo);
    renderFlow();
    await screen.findByText(/Step 3\/6/);
    scrollTo.mockClear();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Next/ })); });
    expect(await screen.findByText(/Step 4\/6/)).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });
});
