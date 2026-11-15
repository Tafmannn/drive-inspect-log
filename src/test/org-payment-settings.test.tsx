import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const h = vi.hoisted(() => ({
  updates: [] as { values: Record<string, unknown>; id: unknown }[],
  error: null as { message: string } | null,
  toasts: [] as { title?: string; description?: string; variant?: string }[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: (_c: string, id: unknown) => {
          h.updates.push({ values, id });
          return Promise.resolve({ error: h.error });
        },
      }),
    }),
  },
}));
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => h.toasts.push(t) }));

import { OrgPaymentSettings } from "@/features/onboarding/components/OrgPaymentSettings";

const SAVED = { bank_name: "Test Bank", bank_account_name: "Test Ltd", bank_sort_code: "12-34-56", bank_account_number: "12345678", late_payment_notice: true };

function setup(org: Parameters<typeof OrgPaymentSettings>[0]["org"]) {
  const onSaved = vi.fn();
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <OrgPaymentSettings orgId="org-1" org={org} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { onSaved, invalidate };
}

beforeEach(() => {
  h.updates = [];
  h.error = null;
  h.toasts = [];
});

describe("OrgPaymentSettings", () => {
  it("warns when no bank details are saved, and offers to add them", () => {
    setup({});
    expect(screen.getByText(/No bank details saved, so invoices show no payment details/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add/ })).toBeTruthy();
  });

  it("shows saved details", () => {
    setup(SAVED);
    expect(screen.getByText("12-34-56")).toBeTruthy();
    expect(screen.getByText("12345678")).toBeTruthy();
    expect(screen.queryByText(/No bank details saved/)).toBeNull();
    expect(screen.getByRole("button", { name: /Edit/ })).toBeTruthy();
  });

  it("saves normalised details, tells the page, and refreshes the invoice settings", async () => {
    const { onSaved, invalidate } = setup({});
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Bank (optional)"), { target: { value: "Test Bank" } });
    fireEvent.change(dialog.getByLabelText("Account name"), { target: { value: "Test Ltd" } });
    fireEvent.change(dialog.getByLabelText("Sort code"), { target: { value: "123456" } });
    fireEvent.change(dialog.getByLabelText("Account number"), { target: { value: "1234 5678" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(h.updates).toHaveLength(1));
    expect(h.updates[0]).toEqual({
      id: "org-1",
      values: { bank_name: "Test Bank", bank_account_name: "Test Ltd", bank_sort_code: "12-34-56", bank_account_number: "12345678" },
    });
    expect(onSaved).toHaveBeenCalledWith(h.updates[0].values);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["invoicing", "org-settings"] });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.toasts[0].title).toBe("Bank details saved");
  });

  it("shows what is wrong and saves nothing for a bad entry", async () => {
    setup({});
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Sort code"), { target: { value: "12-34" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    expect(await dialog.findByText(/six digits/)).toBeTruthy();
    expect(dialog.getByText("Enter the account number.")).toBeTruthy();
    expect(h.updates).toEqual([]);
  });

  it("starts the editor from the saved details, and clearing them is allowed", async () => {
    const { onSaved } = setup(SAVED);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    const dialog = within(await screen.findByRole("dialog"));
    expect((dialog.getByLabelText("Sort code") as HTMLInputElement).value).toBe("12-34-56");
    for (const label of ["Bank (optional)", "Account name", "Sort code", "Account number"]) {
      fireEvent.change(dialog.getByLabelText(label), { target: { value: "" } });
    }
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(h.updates[0].values).toEqual({ bank_name: null, bank_account_name: null, bank_sort_code: null, bank_account_number: null });
    expect(h.toasts[0].title).toBe("Bank details cleared");
  });

  it("keeps the dialog open and reports a save failure", async () => {
    h.error = { message: "violates check constraint" };
    const { onSaved } = setup({});
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Account name"), { target: { value: "Test Ltd" } });
    fireEvent.change(dialog.getByLabelText("Sort code"), { target: { value: "123456" } });
    fireEvent.change(dialog.getByLabelText("Account number"), { target: { value: "12345678" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Could not save the bank details", variant: "destructive" }));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("turns the late-payment wording on and off", async () => {
    const { onSaved } = setup({ ...SAVED, late_payment_notice: true });
    const toggle = screen.getByLabelText("Late-payment wording");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ late_payment_notice: false }));
    expect(h.updates[0]).toEqual({ id: "org-1", values: { late_payment_notice: false } });
  });

  it("treats a missing setting as on, and reports a failure to change it", async () => {
    h.error = { message: "denied" };
    const { onSaved } = setup({});
    expect(screen.getByLabelText("Late-payment wording").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByLabelText("Late-payment wording"));
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Could not change the setting" }));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
