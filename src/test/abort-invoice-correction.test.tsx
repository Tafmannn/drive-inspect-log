/** Client-confirmed correction is a full-invoice credit, never a silent edit. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AbortInvoiceCorrection } from "@/features/abort/components/AbortInvoiceCorrection";
import type { JobAbort } from "@/features/abort/api/abortApi";

const state = vi.hoisted(() => ({
  superAdmin: true,
  isLoading: false,
  isError: false,
  activeInvoice: null as null | {
    id: string; invoice_number: string; status: string;
    total: number; client_id: string; otherJobCount: number;
  },
  corrections: [] as Array<Record<string, unknown>>,
  mutate: vi.fn(),
  defer: vi.fn(),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ isSuperAdmin: state.superAdmin }),
}));
vi.mock("@/features/abort/hooks/useAbort", () => ({
  useAbortInvoiceDetails: () => ({
    isLoading: state.isLoading,
    isError: state.isError,
    error: new Error("RLS denied"),
    data: { activeInvoice: state.activeInvoice, corrections: state.corrections },
  }),
  useCorrectInvoicedAbortFee: () => ({ isPending: false, mutateAsync: state.mutate }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/features/invoicing/api/invoiceCorrectionRequests", () => ({ useDeferInvoiceCorrection: () => ({ isPending: false, mutateAsync: state.defer }) }));

const abort = {
  id: "abort-1", job_id: "job-1", agreed_price: 240, approved_amount: 240,
  finance_status: "approved", reopened_at: null,
} as JobAbort;
const renderCorrection = () => render(
  <MemoryRouter>
    <AbortInvoiceCorrection jobId="job-1" clientId="client-1" abort={abort} />
  </MemoryRouter>,
);

beforeEach(() => {
  state.superAdmin = true;
  state.isLoading = false;
  state.isError = false;
  state.activeInvoice = {
    id: "invoice-1", invoice_number: "AX26-100", status: "sent",
    total: 240, client_id: "client-1", otherJobCount: 0,
  };
  state.corrections = [];
  state.defer.mockReset().mockResolvedValue("request-1");
  state.mutate.mockReset();
  state.mutate.mockResolvedValue({
    correctionId: "correction-1", creditNoteId: "credit-1",
    originalInvoiceNumber: "AX26-100", approvedAmount: 275,
    otherJobsToReinvoice: 0, originalWasPaid: false,
  });
});

describe("invoiced Abort fee correction", () => {
  it("requires client agreement, a reason, and confirms a higher fee", async () => {
    renderCorrection();
    fireEvent.click(screen.getByRole("button", { name: "Correct invoiced Abort fee" }));
    const confirm = screen.getByRole("button", { name: "Issue full credit & update fee" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Client-confirmed revised Abort fee (£)"), {
      target: { value: "275.00" },
    });
    fireEvent.change(screen.getByLabelText("Reason for correction"), {
      target: { value: "Client confirmed a higher Abort fee" },
    });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByText("I confirm the client has agreed to this revised Abort fee."));
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByText("I authorise creation of a full credit note for the original invoice."));
    expect(confirm.hasAttribute("disabled")).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(state.mutate).toHaveBeenCalledWith({
        abortId: "abort-1", originalInvoiceId: "invoice-1",
        newAmount: 275, expectedAmount: 240,
        reason: "Client confirmed a higher Abort fee", clientConfirmed: true,
        multiJobAcknowledged: false, paidAcknowledged: false, authoriseCredit: true,
      });
    });
  });

  it("requires explicit warnings for a paid multi-job invoice", () => {
    state.activeInvoice = { ...state.activeInvoice!, status: "paid", otherJobCount: 2 };
    renderCorrection();
    fireEvent.click(screen.getByRole("button", { name: "Correct invoiced Abort fee" }));
    fireEvent.change(screen.getByLabelText("Client-confirmed revised Abort fee (£)"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByLabelText("Reason for correction"), {
      target: { value: "Client agreed a reduced final fee" },
    });
    fireEvent.click(screen.getByText("I confirm the client has agreed to this revised Abort fee."));
    const confirm = screen.getByRole("button", { name: "Issue full credit & update fee" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByText("I understand the whole invoice will be credited."));
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByText("I will reconcile the original payment/refund separately."));
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByText("I authorise creation of a full credit note for the original invoice."));
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("defers a correction without authorising a credit note or amending the fee", async () => {
    renderCorrection();
    fireEvent.click(screen.getByRole("button", { name: "Correct invoiced Abort fee" }));
    fireEvent.change(screen.getByLabelText("Client-confirmed revised Abort fee (£)"), { target: { value: "275" } });
    fireEvent.change(screen.getByLabelText("Reason for correction"), { target: { value: "Client agreed a revised fee" } });
    fireEvent.click(screen.getByText("I confirm the client has agreed to this revised Abort fee."));
    fireEvent.click(screen.getByRole("button", { name: "Review later" }));
    await waitFor(() => expect(state.defer).toHaveBeenCalledWith({
      invoiceId: "invoice-1", reason: "Client agreed a revised fee", abortId: "abort-1",
      revisedFee: 275, expectedFee: 240, clientConfirmed: true,
    }));
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("does not offer a credit correction to ordinary administrators", () => {
    state.superAdmin = false;
    renderCorrection();
    expect(screen.queryByRole("button", { name: "Correct invoiced Abort fee" })).toBeNull();
    expect(screen.getByText(/Only a Super Admin/)).toBeTruthy();
  });

  it("shows the full credit and next step without modifying historic amounts", () => {
    state.activeInvoice = null;
    state.corrections = [{
      id: "cor-1", original_invoice_id: "invoice-1", original_invoice_number: "AX26-100",
      credit_note_id: "credit-1", replacement_invoice_id: null,
      previous_fee: 240, revised_fee: 200,
      other_jobs_on_invoice: 0, original_was_paid: false,
      created_at: "2026-11-23T20:00:00Z", reason: "Client agreed a lower fee",
    }];
    renderCorrection();
    expect(screen.getByText(/AX26-100 — full credit issued/)).toBeTruthy();
    expect(screen.getByText(/£240.00 → £200.00/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Prepare revised invoice" })
      .getAttribute("href")).toBe("/control/invoice-prep?clientId=client-1&abortCorrectionJob=job-1");
  });

  it("fails closed when invoice records cannot be read", () => {
    state.isError = true;
    renderCorrection();
    expect(screen.getByRole("alert").textContent).toMatch(/Invoice history unavailable/);
    expect(screen.queryByRole("button", { name: "Correct invoiced Abort fee" })).toBeNull();
  });
});
