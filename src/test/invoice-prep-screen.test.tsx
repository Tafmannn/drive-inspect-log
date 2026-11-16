/**
 * Invoice Prep, driven as an admin would: pick a client, tick jobs, choose
 * which expenses to recharge, and create the invoice. Data hooks are mocked;
 * the screen's own wiring (default ticks, totals, the VAT switch, PO rule,
 * what is handed to createInvoice) is real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type { BillableExpense } from "@/features/invoicing/lib/invoiceMath";
import type { EligibleJob } from "@/features/invoicing/hooks/useInvoicePrepData";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const state = vi.hoisted(() => ({
  vatRegistered: false,
  poRequired: false,
  mutateAsync: null as unknown as ReturnType<typeof import("vitest").vi.fn>,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ isAdmin: true, isSuperAdmin: false, user: { id: "u1", roles: ["ADMIN"] } }),
}));

vi.mock("@/features/control/components/shared/ControlShell", () => ({
  ControlShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ControlHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  ControlSection: ({ title, children }: { title: string; children: ReactNode }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
vi.mock("@/features/control/components/shared/KpiStrip", () => ({ KpiStrip: () => null }));
vi.mock("@/features/control/components/shared/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("@/components/ui-kit", () => ({
  WarningCallout: ({ children }: { children: ReactNode }) => <p role="alert">{children}</p>,
  RoleScope: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/PodEmailConfirmDialog", () => ({ PodEmailConfirmDialog: () => null }));
vi.mock("@/hooks/useEvidenceOverrides", () => ({
  useEvidenceOverrides: () => ({ isAcknowledged: () => false, acknowledge: vi.fn(), unacknowledge: vi.fn() }),
}));

vi.mock("@/features/clients/components/ClientPickerCombobox", () => ({
  ClientPickerCombobox: ({ onSelect }: { onSelect: (id: string | null) => void }) => (
    <button onClick={() => onSelect("client-1")}>Pick CJE</button>
  ),
}));

vi.mock("@/hooks/useClients", () => ({
  useClients: () => ({
    data: [
      {
        id: "client-1", org_id: "org-1", name: "Chris", company: "CJE Transport", email: "c@cje.example",
        phone: null, address: null, notes: null, is_active: true, created_at: "", updated_at: "",
        payment_terms: "Net 30", po_required: state.poRequired,
      },
    ],
  }),
}));

function job(id: string, price: number, date: string): EligibleJob {
  return {
    id, external_job_number: id.toUpperCase(), vehicle_reg: "AB12 CDE", vehicle_make: "Ford", vehicle_model: "Transit",
    job_date: date, completed_at: `${date}T12:00:00Z`, total_price: price, distance_miles: null, client_id: "client-1",
    client_company: "CJE Transport", client_name: "Chris", client_email: null, client_phone: null, status: "completed",
    pickup_city: "Leeds", pickup_postcode: "LS11 5AB", delivery_city: "Bristol", delivery_postcode: "BS34 7QQ",
    receiptCount: 1,
    readiness: { ready: true, primaryReason: "Ready", blockers: [], warnings: [], alreadyInvoiced: false, evidenceLevel: "green" },
  } as EligibleJob;
}
const JOBS = [job("ax1042", 185, "2026-11-02"), job("ax1043", 95, "2026-11-03")];

const EXPENSES: BillableExpense[] = [
  { id: "e-fuel", job_id: "ax1042", date: "2026-11-02", category: "Fuel", supplier: "Shell", label: null, amount: 54.6, vat_amount: 9.1, receipts: [{ url: "r1" }] },
  { id: "e-wash", job_id: "ax1042", date: "2026-11-02", category: "Car Wash / Valet", supplier: null, label: null, amount: 12, vat_amount: null, receipts: [] },
  { id: "e-fuel2", job_id: "ax1043", date: "2026-11-03", category: "Fuel", supplier: "BP", label: null, amount: 44.66, vat_amount: 7.44, receipts: [{ url: "r2" }] },
];

vi.mock("@/features/invoicing/hooks/useInvoicePrepData", () => ({
  useEligibleJobs: (client: unknown) => ({ data: client ? JOBS : [], isLoading: false }),
}));
vi.mock("@/features/invoicing/hooks/useInvoiceSettings", () => ({
  useOrgInvoiceSettings: () => ({
    data: { orgId: "org-1", vatRegistered: state.vatRegistered, business: { name: "Axentra" } },
    isLoading: false,
  }),
  useBillableExpenses: (jobIds: string[]) => ({
    data: EXPENSES.filter((e) => jobIds.includes(e.job_id)),
    isLoading: false,
  }),
}));
vi.mock("@/features/invoicing/hooks/useInvoices", async () => {
  const actual = await vi.importActual<typeof import("@/features/invoicing/hooks/useInvoices")>(
    "@/features/invoicing/hooks/useInvoices",
  );
  return { ...actual, useInvoices: () => ({ data: [], isLoading: false }) };
});
vi.mock("@/features/invoicing/hooks/useCreateInvoice", () => ({
  useCreateInvoice: () => ({ mutateAsync: state.mutateAsync, isPending: false }),
}));

import { InvoicePrepScreen } from "@/features/invoicing/pages/InvoicePrepScreen";
import { buildInvoiceDraft } from "@/features/invoicing/lib/invoiceMath";

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <InvoicePrepScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function pickClientAndAllJobs() {
  fireEvent.click(screen.getByText("Pick CJE"));
  fireEvent.click(screen.getByLabelText("Select all"));
}

beforeEach(() => {
  state.vatRegistered = false;
  state.poRequired = false;
  state.mutateAsync = vi.fn(async (input: { jobs: EligibleJob[]; expenses: BillableExpense[]; vatRegistered: boolean; vatRate: number }) => ({
    invoiceId: "inv-1",
    invoiceNumber: "AX26-1007",
    jobCount: input.jobs.length,
    issueDate: "2026-11-14",
    dueDate: "2026-12-14",
    paymentTerms: "Payable within 30 days",
    draft: buildInvoiceDraft(input),
  }));
});

describe("InvoicePrepScreen", () => {
  it("shows no expense step until jobs are ticked", () => {
    renderScreen();
    fireEvent.click(screen.getByText("Pick CJE"));
    expect(screen.queryByText("3. Rechargeable Expenses")).toBeNull();
    expect(screen.getByText("AX1042")).toBeTruthy();
  });

  it("pre-ticks fuel only, and flags an expense with no receipt", () => {
    renderScreen();
    pickClientAndAllJobs();

    const picker = within(screen.getByLabelText("3. Rechargeable Expenses"));
    const boxes = picker.getAllByRole("checkbox");
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "false", "true"]);
    expect(picker.getByText("No receipt")).toBeTruthy();
    expect(picker.getByText("2 of 3 expenses selected")).toBeTruthy();
    expect(picker.getByText("Recharging £99.26")).toBeTruthy();
  });

  it("VAT off: no VAT anywhere, totals are transport + ticked expenses", () => {
    renderScreen();
    pickClientAndAllJobs();

    const preview = within(screen.getByLabelText("4. Invoice Preview"));
    expect(preview.queryByLabelText("VAT")).toBeNull();
    expect(preview.getByText(/Not VAT registered/)).toBeTruthy();
    expect(preview.getByText("Total due")).toBeTruthy();
    expect(preview.getByText("£379.26")).toBeTruthy(); // 280 + 99.26
    expect(preview.getByText("Expenses: Fuel £54.60 (R01)")).toBeTruthy();
  });

  it("a category chip adds every expense in that category to the invoice", () => {
    renderScreen();
    pickClientAndAllJobs();

    const picker = within(screen.getByLabelText("3. Rechargeable Expenses"));
    fireEvent.click(picker.getByRole("button", { name: /Car Wash \/ Valet/ }));

    expect(picker.getByText("3 of 3 expenses selected")).toBeTruthy();
    expect(picker.getByText(/1 selected expense has no receipt on file/)).toBeTruthy();
    const preview = within(screen.getByLabelText("4. Invoice Preview"));
    expect(preview.getByText("£391.26")).toBeTruthy();
    // same date, so ordered by id: e-fuel before e-wash
    expect(preview.getByText("Expenses: Fuel £54.60 (R01), Car Wash / Valet £12.00 (R02)")).toBeTruthy();
  });

  it("creates the invoice with exactly the ticked jobs and expenses, VAT off", async () => {
    renderScreen();
    pickClientAndAllJobs();
    fireEvent.change(screen.getByLabelText(/Client PO \/ reference/), { target: { value: "PO-4500123" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Invoice/ }));

    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(1));
    const input = state.mutateAsync.mock.calls[0][0];
    expect(input).toMatchObject({ vatRegistered: false, orgId: "org-1", clientRef: "PO-4500123" });
    expect(input.jobs.map((j: EligibleJob) => j.id)).toEqual(["ax1042", "ax1043"]);
    expect(input.expenses.map((e: BillableExpense) => e.id)).toEqual(["e-fuel", "e-fuel2"]);

    // Success card, with the selection cleared.
    expect(await screen.findByText(/Invoice AX26-1007 created/)).toBeTruthy();
    expect(screen.getByText(/£379\.26/)).toBeTruthy();
    expect(screen.queryByText("4. Invoice Preview")).toBeNull();
  });

  it("unticking fuel removes it from what is created", async () => {
    renderScreen();
    pickClientAndAllJobs();
    const picker = within(screen.getByLabelText("3. Rechargeable Expenses"));
    fireEvent.click(picker.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /Create Invoice/ }));

    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    expect(state.mutateAsync.mock.calls[0][0].expenses.map((e: BillableExpense) => e.id)).toEqual(["e-fuel2"]);
  });

  it("blocks creation without a PO for a client that requires one", async () => {
    state.poRequired = true;
    renderScreen();
    pickClientAndAllJobs();

    expect(screen.getByLabelText(/Client PO \/ reference \(required\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Create Invoice/ }));
    await Promise.resolve();
    expect(state.mutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Client PO \/ reference/), { target: { value: "PO-1" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Invoice/ }));
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("VAT on: shows the VAT rate, recharges expenses net, and adds VAT to the total", async () => {
    state.vatRegistered = true;
    renderScreen();
    pickClientAndAllJobs();

    const preview = within(screen.getByLabelText("4. Invoice Preview"));
    expect((preview.getByLabelText("VAT") as HTMLInputElement).value).toBe("20");
    // transport 280 + net expenses (45.50 + 37.22) = 362.72; VAT 72.54; total 435.26
    expect(preview.getByText("£362.72")).toBeTruthy();
    expect(preview.getByText("£72.54")).toBeTruthy();
    expect(preview.getByText("£435.26")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Create Invoice/ }));
    await waitFor(() => expect(state.mutateAsync).toHaveBeenCalled());
    expect(state.mutateAsync.mock.calls[0][0]).toMatchObject({ vatRegistered: true, vatRate: 20 });
  });
});
