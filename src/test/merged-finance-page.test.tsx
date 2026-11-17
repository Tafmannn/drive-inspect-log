// @vitest-environment jsdom
// Merged Finance screen (phone layout): expense cards and the receipt
// compliance KPI from the old mobile page, filters kept in the URL.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

const h = vi.hoisted(() => ({ receipt: vi.fn() }));

vi.mock("@/features/control/hooks/useControlFinanceData", () => ({
  useControlFinanceData: (f: { receipt: string }) => {
    h.receipt(f.receipt);
    return {
      data: [
        {
          id: "e1", job_id: "j1", job_number: "AX0001", job_reg: "AB12 CDE", amount: 12.5, category: "Fuel",
          label: "Shell", notes: null, date: "2026-11-17", hasReceipt: false,
        },
      ],
      isLoading: false,
    };
  },
  useFinanceKpis: () => ({
    data: {
      totalExpenses: 10, totalSpend: 100, spendToday: 12.5, spendThisWeek: 60, withReceipt: 7, withoutReceipt: 3,
      breakdownRows: { totalExpenses: [], spendToday: [], spendThisWeek: [], withReceipt: [], withoutReceipt: [] },
    },
    isLoading: false,
  }),
}));

import { ControlFinance } from "@/features/control/pages/ControlFinance";

function Probe() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}
function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/control/finance" element={<><ControlFinance /><Probe /></>} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}
const loc = () => screen.getByTestId("loc").textContent;

describe("Finance screen", () => {
  it("shows receipt compliance (70% is below the 80% target)", () => {
    renderAt("/control/finance");
    expect(screen.getByText("70%")).toBeInTheDocument();
  });

  it("compliance tile filters to expenses without a receipt", () => {
    renderAt("/control/finance");
    fireEvent.click(screen.getByRole("button", { name: /receipt compliance 70%/i }));
    expect(loc()).toBe("/control/finance?receipt=without");
    expect(h.receipt).toHaveBeenLastCalledWith("without");
  });

  it("renders expense cards on phones; the job badge opens the job", () => {
    renderAt("/control/finance?receipt=without");
    expect(screen.getByText("No receipt", { selector: "span" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open job AX0001/i }));
    expect(loc()).toBe("/jobs/j1?from=%2Fcontrol%2Ffinance");
  });

  it("tapping the card opens the expense", () => {
    renderAt("/control/finance");
    fireEvent.click(screen.getByText("Shell"));
    expect(loc()).toBe("/expenses/e1/edit?from=%2Fcontrol%2Ffinance");
  });
});
