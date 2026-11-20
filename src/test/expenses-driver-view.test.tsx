// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Capture the filters passed to useExpenses. A driver's list is kept private by the
// database (expenses_select_scoped: only expenses on jobs assigned to them), not by a
// client-side filter. The page used to filter on expenses.driver_id, a column nothing
// ever sets, so every driver saw an empty list. These tests pin the fixed behaviour.
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

let mockGate: { isDriverOnly: boolean; driverProfileId: string | null } = { isDriverOnly: true, driverProfileId: "driver-1" };
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

  it("shows the driver their expenses instead of the old dead-end", () => {
    renderExpenses();
    // Appears in both the "Your spend" tile and the expense row.
    expect(screen.getAllByText("£12.50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Fuel")).toBeTruthy();
    expect(screen.queryByText(/open a job to view or add expenses/i)).toBeNull();
  });

  it("does NOT filter on driver_id (nothing sets it, so it emptied every driver's list)", () => {
    renderExpenses();
    const calledWith = useExpensesSpy.mock.calls.map((c) => c[0]);
    expect(calledWith.length).toBeGreaterThan(0);
    for (const f of calledWith) {
      expect(f).toBeDefined(); // the query runs
      expect(f).not.toHaveProperty("driverId");
    }
  });

  it("loads straight away, without waiting for the driver profile to be found", () => {
    mockGate = { isDriverOnly: true, driverProfileId: null };
    renderExpenses();
    const calledWith = useExpensesSpy.mock.calls.map((c) => c[0]);
    expect(calledWith.every((f) => f !== undefined)).toBe(true);
    expect(screen.getAllByText("£12.50").length).toBeGreaterThanOrEqual(1);
  });

  it("still applies the date range, and no category until one is chosen", () => {
    renderExpenses();
    const f = useExpensesSpy.mock.calls[0][0] as { dateFrom?: string; category?: string };
    expect(f.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(f.category).toBeUndefined();
  });
});
