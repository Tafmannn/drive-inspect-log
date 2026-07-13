/**
 * WORKFLOW-007: if creating a new expense succeeds but a receipt upload
 * fails afterwards, the old handleSubmit had no memory of the successful
 * create — tapping "Save" again (the only recovery affordance shown)
 * called createExpense a second time, producing a duplicate expense
 * record for the same job/amount. This renders the actual page and drives
 * two real submit clicks to prove only one expense is ever created.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Radix Select needs these DOM APIs, which jsdom doesn't implement.
beforeAll(() => {
  Object.assign(window.HTMLElement.prototype, {
    scrollIntoView: vi.fn(),
    hasPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  });
});

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => mockToast(...a) }));

const mockCreateExpense = vi.fn();
const mockUpdateExpense = vi.fn();
const mockUploadReceipt = vi.fn();
vi.mock("@/hooks/useExpenses", () => ({
  useCreateExpense: () => ({ mutateAsync: (...a: unknown[]) => mockCreateExpense(...a) }),
  useUpdateExpense: () => ({ mutateAsync: (...a: unknown[]) => mockUpdateExpense(...a) }),
  useUploadReceipt: () => ({ mutateAsync: (...a: unknown[]) => mockUploadReceipt(...a) }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ canUseGallery: true }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
  },
}));

vi.mock("@/components/AppHeader", () => ({ AppHeader: ({ title }: { title: string }) => <header>{title}</header> }));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => null }));
vi.mock("@/components/PhotoViewer", () => ({ PhotoViewer: () => null }));

// Radix Select's listbox portal doesn't drive reliably in jsdom; swap in a
// plain native <select> for this test so category selection is a simple,
// robust fireEvent.change instead of simulating pointer/portal interactions
// unrelated to the defect under test.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  type WithChildren = { children?: React.ReactNode };
  return {
    Select: ({ value, onValueChange, children }: WithChildren & { value: string; onValueChange: (v: string) => void }) => (
      <select
        aria-label="Category"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {React.Children.toArray(children).flatMap((child) =>
          React.Children.toArray((child as React.ReactElement<WithChildren>)?.props?.children),
        )}
      </select>
    ),
    SelectTrigger: ({ children }: WithChildren) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: WithChildren) => <>{children}</>,
    SelectItem: ({ value, children }: WithChildren & { value: string }) => <option value={value}>{children}</option>,
  };
});

import { ExpenseForm } from "@/pages/ExpenseForm";

function renderForm() {
  return render(
    <MemoryRouter initialEntries={["/expenses/new?jobId=job-1"]}>
      <Routes>
        <Route path="/expenses/new" element={<ExpenseForm />} />
        <Route path="/expenses" element={<div>Expenses list</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillRequiredFields() {
  const amountInput = screen.getByLabelText("Amount (£)");
  fireEvent.change(amountInput, { target: { value: "42.50" } });
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Fuel" } });
}

beforeEach(() => {
  mockToast.mockReset();
  mockCreateExpense.mockReset();
  mockUpdateExpense.mockReset();
  mockUploadReceipt.mockReset();
});

describe("ExpenseForm — no duplicate expense on retry after a partial failure (WORKFLOW-007)", () => {
  it("does not call createExpense again on a retried submit after receipt upload failure", async () => {
    mockCreateExpense.mockResolvedValue({ id: "exp-1" });
    // First upload attempt fails, second (retry) succeeds.
    mockUploadReceipt.mockRejectedValueOnce(new Error("network error")).mockResolvedValueOnce(undefined);

    renderForm();
    fillRequiredFields();

    // Attach one receipt file so the upload step actually runs.
    const cameraInput = document.querySelector('input[type="file"][capture="environment"]') as HTMLInputElement;
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(cameraInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockCreateExpense).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockUploadReceipt).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Save failed", description: expect.stringMatching(/was saved/i) }),
      ),
    );

    // Retry — must resume (upload only), not create a second expense.
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockUploadReceipt).toHaveBeenCalledTimes(2));
    expect(mockCreateExpense).toHaveBeenCalledTimes(1);
  });
});
