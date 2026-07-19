// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Capture the filters passed to useExpenses so we can assert the driver view is
// scoped by driver_id (the expenses RLS is org-wide, so this filter is the ONLY
// thing stopping a driver from seeing the whole org's spend).
const useExpensesSpy = vi.fn();
vi.mock("@/hooks/useExpenses", () => ({
  useExpenses: (filters: unknown) => {
    useExpensesSpy(filters);
    return {
      data: [
        { id: "e1", amount: 12.5, category: "Fuel", date: "2026-07-18", label: "Diesel", receipts: [] },
      ],
      isLoading: false,
    };
  },
  useExpenseTotals: () => ({ data: undefined }),
  useJobExpenses: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("@/hooks/useJobs", () => ({ useJob: () => ({ data: null }) }));

let mockGate = { isDriverOnly: true, driverProfileId: "driver-1" };
vi.mock("@/hooks/useDriverGate", () => ({ useDriverGate: () => mockGate }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false }) }));

import { Expenses } from "@/pages/Expenses";

function renderExpenses() {
  return render(
    <MemoryRouter initialEntries={["/expenses"]}>
      <Expenses />
    </MemoryRouter>,
  );
}

describe("Expenses — driver view", () => {
  beforeEach(() => {
    useExpensesSpy.mockClear();
    mockGate = { isDriverOnly: true, driverProfileId: "driver-1" };
  });

  it("shows the driver their own expenses instead of the old dead-end", () => {
    renderExpenses();
    // Appears in both the "Your spend" tile and the expense row.
    expect(screen.getAllByText("£12.50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Fuel")).toBeTruthy();
    expect(screen.queryByText(/open a job to view or add expenses/i)).toBeNull();
  });

  it("scopes the query to the signed-in driver (driver_id filter)", () => {
    renderExpenses();
    const calledWith = useExpensesSpy.mock.calls.map((c) => c[0]);
    // At least one call must carry the driver's id; none may omit it while enabled.
    expect(calledWith.some((f) => f && f.driverId === "driver-1")).toBe(true);
    expect(calledWith.every((f) => f === undefined || f.driverId === "driver-1")).toBe(true);
  });

  it("does not run an unscoped query before the driver id is known", () => {
    mockGate = { isDriverOnly: true, driverProfileId: null } as any;
    renderExpenses();
    // With no driver id, the query is disabled (filters === undefined), never
    // an org-wide fetch.
    const calledWith = useExpensesSpy.mock.calls.map((c) => c[0]);
    expect(calledWith.every((f) => f === undefined)).toBe(true);
  });
});
