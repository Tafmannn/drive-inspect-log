/**
 * UI V2 inspection steps (odometer & fuel, checklist, photos, review):
 * the new controls write the same values through the same form state, and
 * the review states only what is actually true.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>("@/context/AuthContext");
  return { ...actual, useAuth: () => ({ canUseGallery: false, user: { id: "u1" }, isAdmin: false, isSuperAdmin: false }) };
});
const job = {
  id: "job-1", external_job_number: "AX0001", status: "ready_for_pickup", vehicle_reg: "AB12CDE",
  vehicle_make: "Kia", vehicle_model: "Sportage", vehicle_type: "suv",
  driver_id: "dp-1", inspections: [], photos: [], damage_items: [],
  has_pickup_inspection: false, has_delivery_inspection: false, updated_at: new Date().toISOString(),
};
vi.mock("@/hooks/useJobs", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useJobs")>("@/hooks/useJobs");
  return { ...actual, useJob: () => ({ data: job, isLoading: false, isError: false }) };
});
vi.mock("@/hooks/useDriverGate", () => ({
  useDriverGate: () => ({ status: "active", driverProfileId: "dp-1", onboardingStatus: null, isDriverOnly: true }),
}));

import { InspectionFlow } from "@/pages/InspectionFlow";

function renderAt(step: number, data: Record<string, unknown> = {}) {
  // An active same-session draft restores silently at its saved step.
  sessionStorage.setItem("axentra.inspection.session.job-1.pickup", "1");
  localStorage.setItem(
    "axentra.draft.pickup:job-1",
    JSON.stringify({ savedAt: new Date().toISOString(), data: { _currentStep: step, ...data } }),
  );
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
const group = (name: RegExp) => screen.getByRole("radiogroup", { name });
const pick = (g: HTMLElement, opt: string) => fireEvent.click(within(g).getByRole("radio", { name: new RegExp(`^${opt.replace("/", "\\/")}$`) }));
const checked = (g: HTMLElement) => within(g).getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.textContent);

beforeEach(() => {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  localStorage.clear();
  sessionStorage.clear();
});

describe("Odometer & fuel step", () => {
  it("fuel is a radiogroup; picking writes the value and Next moves on", () => {
    renderAt(1);
    expect(screen.getByText("Step 1 of 6 · Odometer & Fuel")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Odometer reading/), { target: { value: "54321" } });
    const fuel = group(/Fuel level/);
    expect(within(fuel).getAllByRole("radio")).toHaveLength(5);
    pick(fuel, "3/4");
    expect(checked(fuel)).toEqual(["3/4"]);
    pick(fuel, "Full");
    expect(checked(fuel)).toEqual(["Full"]);
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(screen.getByText("Step 2 of 6 · Checklist")).toBeInTheDocument();
  });

  it("Next is blocked until fuel is chosen", () => {
    renderAt(1, { odometer: "100" });
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(screen.getByText("Step 1 of 6 · Odometer & Fuel")).toBeInTheDocument();
  });
});

describe("Checklist step", () => {
  it("conditions, keys, equipment and wheels write their values", () => {
    renderAt(2);
    pick(group(/Vehicle condition/), "Wet");
    expect(checked(group(/Vehicle condition/))).toEqual(["Wet"]);
    pick(group(/^Light/), "Dark");
    pick(group(/Oil level/), "Issue");
    pick(group(/Water level/), "Ok");
    expect(checked(group(/Oil level/))).toEqual(["Issue"]);

    const keys = screen.getByRole("spinbutton", { name: /Number of keys/ }) as HTMLInputElement;
    expect(screen.getByRole("button", { name: "One fewer key" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "One more key" }));
    fireEvent.click(screen.getByRole("button", { name: "One more key" }));
    expect(keys.value).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "One fewer key" }));
    expect(keys.value).toBe("1");
    fireEvent.change(keys, { target: { value: "3" } });
    expect(keys.value).toBe("3");

    const handbook = group(/^Handbook$/);
    pick(handbook, "Yes");
    pick(group(/^MOT$/), "N/A");
    expect(checked(handbook)).toEqual(["Yes"]);
    expect(checked(group(/^MOT$/))).toEqual(["N/A"]);
    expect(screen.getAllByRole("radiogroup").length).toBeGreaterThanOrEqual(13 + 5);

    expect(screen.queryByRole("radiogroup", { name: /Alloys damaged/ })).toBeNull();
    pick(group(/Alloys or trims/), "Alloys");
    pick(group(/Alloys damaged/), "No");
    expect(checked(group(/Alloys damaged/))).toEqual(["No"]);
    pick(group(/Alloys or trims/), "Trims");
    pick(group(/Wheel trims damaged/), "Yes");
    expect(screen.queryByRole("radiogroup", { name: /Alloys damaged/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Scuff" } });
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Scuff");

    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(screen.getByText("Step 3 of 6 · Vehicle Damage")).toBeInTheDocument();
  });

  it("required conditions and keys still block Next", () => {
    renderAt(2);
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(screen.getByText("Step 2 of 6 · Checklist")).toBeInTheDocument();
  });
});

describe("Photos step", () => {
  it("shows the captured count and a capture tile per required photo", () => {
    renderAt(4);
    expect(screen.getByText("0 of 7")).toBeInTheDocument();
    expect(screen.getAllByText("Tap to capture")).toHaveLength(7);
    expect(screen.getByText("Add photo")).toBeInTheDocument();
  });
});

describe("Review step", () => {
  it("states signatures in words and damage only as declared", () => {
    renderAt(6, { odometer: "54321", fuelLevel: "3/4", driverName: "Dee", customerName: "Pat", damageDeclaration: "none_found" });
    expect(screen.getByText("None found (confirmed)")).toBeInTheDocument();
    expect(screen.getAllByText("Not signed")).toHaveLength(2);
    expect(screen.getByText("AX0001")).toBeInTheDocument();
  });

  it("an unanswered damage step is 'Not stated', never 'none'", () => {
    renderAt(6, { odometer: "1", fuelLevel: "Full" });
    expect(screen.getByText("Not stated")).toBeInTheDocument();
    expect(screen.queryByText(/None found/)).toBeNull();
  });
});
