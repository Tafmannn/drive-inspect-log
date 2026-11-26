import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferInvoiceCorrection, useDeferInvoiceCorrection, usePendingInvoiceCorrections, useWithdrawInvoiceCorrection } from "@/features/invoicing/api/invoiceCorrectionRequests";
import { InvoiceCorrectionQueue } from "@/features/invoicing/components/InvoiceCorrectionQueue";
import { acknowledgeMissingEvidence, listAcknowledgedEvidenceJobIds, unacknowledgeMissingEvidence } from "@/lib/evidenceAckApi";

const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), toast: vi.fn(), isSuperAdmin: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: h.from } }));
vi.mock("@/hooks/use-toast", () => ({ toast: h.toast }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ isSuperAdmin: h.isSuperAdmin }) }));
const row = { id: "request-1", invoice_id: "invoice-1", invoice_number: "INV-1", reason: "Wrong reference", status: "pending", abort_id: null, job_id: null, revised_fee: null };
function provider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
  return { Wrapper, client };
}
function pendingRows(data: unknown, error: unknown = null) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  h.from.mockReturnValue({ select });
  return { order, eq, select };
}
beforeEach(() => { vi.resetAllMocks(); h.isSuperAdmin = true; });

describe("financial correction API", () => {
  it("trims the reason and sends explicit fee and customer confirmation", async () => {
    h.rpc.mockResolvedValue({ data: "request-1", error: null });
    await expect(deferInvoiceCorrection({ invoiceId: "inv", reason: " Correction ", abortId: "abort", revisedFee: 200, expectedFee: 100, clientConfirmed: true })).resolves.toBe("request-1");
    expect(h.rpc).toHaveBeenCalledWith("defer_invoice_correction", { p_invoice_id: "inv", p_reason: "Correction", p_abort_id: "abort", p_revised_fee: 200, p_expected_fee: 100, p_client_confirmed: true });
  });
  it("propagates database refusals", async () => {
    h.rpc.mockResolvedValue({ error: { message: "INVOICE_CONFIRMATION_STALE" } });
    await expect(deferInvoiceCorrection({ invoiceId: "inv", reason: "Correction" })).rejects.toThrow("INVOICE_CONFIRMATION_STALE");
  });
  it("queries pending requests in newest-first order", async () => {
    const chain = pendingRows([row]); const { Wrapper } = provider();
    const { result } = renderHook(() => usePendingInvoiceCorrections(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.data).toEqual([row]));
    expect(chain.eq).toHaveBeenCalledWith("status", "pending");
    expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
  it("invalidates the correction queue after deferring or withdrawing", async () => {
    h.rpc.mockResolvedValue({ data: "request-1", error: null }); const { Wrapper, client } = provider();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => ({ defer: useDeferInvoiceCorrection(), withdraw: useWithdrawInvoiceCorrection() }), { wrapper: Wrapper });
    await act(async () => { await result.current.defer.mutateAsync({ invoiceId: "inv", reason: "Correction" }); });
    await act(async () => { await result.current.withdraw.mutateAsync("request-1"); });
    expect(h.rpc).toHaveBeenLastCalledWith("withdraw_invoice_correction", { p_request_id: "request-1" });
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
describe("financial correction queue", () => {
  it("loads an invoice for review without authorising a credit note", async () => {
    const chain = pendingRows([row]); const invoice = { id: "invoice-1", status: "sent" };
    const single = vi.fn().mockResolvedValue({ data: invoice, error: null });
    h.from.mockImplementation((table: string) => table === "invoices" ? { select: () => ({ eq: () => ({ single }) }) } : { select: chain.select });
    const review = vi.fn(); const { Wrapper } = provider();
    render(<InvoiceCorrectionQueue onReview={review} />, { wrapper: Wrapper });
    expect(await screen.findByText(/no credit note has been authorised/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review invoice" }));
    await waitFor(() => expect(review).toHaveBeenCalledWith(invoice, row.reason));
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("refuses review of a cancelled original", async () => {
    const chain = pendingRows([row]);
    h.from.mockImplementation((table: string) => table === "invoices" ? { select: () => ({ eq: () => ({ single: async () => ({ data: { status: "cancelled" }, error: null }) }) }) } : { select: chain.select });
    const review = vi.fn(); const { Wrapper } = provider();
    render(<InvoiceCorrectionQueue onReview={review} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Review invoice" }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Review unavailable", description: "The original invoice is already cancelled." })));
    expect(review).not.toHaveBeenCalled();
  });
  it("reports successful withdrawal without changing the invoice", async () => {
    pendingRows([row]); h.rpc.mockResolvedValue({ error: null }); const { Wrapper } = provider();
    render(<InvoiceCorrectionQueue onReview={vi.fn()} />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw request" }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Correction request withdrawn" })));
  });
  it("shows a retry action when pending requests cannot be read", async () => {
    pendingRows(null, { message: "denied" }); const { Wrapper } = provider();
    render(<InvoiceCorrectionQueue onReview={vi.fn()} />, { wrapper: Wrapper });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });
});
describe("evidence acknowledgements", () => {
  it("uses the server-authorised RPC with a namespaced job identifier", async () => {
    h.rpc.mockResolvedValue({ error: null }); await acknowledgeMissingEvidence("job-1");
    expect(h.rpc).toHaveBeenCalledWith("acknowledge_attention_exception", { p_exception_id: "evidence:job-1", p_job_id: "job-1", p_note: "Missing evidence dismissed by admin" });
  });
  it("does not hide expired or incorrectly linked evidence", async () => {
    const like = vi.fn().mockResolvedValue({ data: [
      { exception_id: "evidence:a", job_id: "a", snoozed_until: null },
      { exception_id: "evidence:b", job_id: "b", snoozed_until: "2000-01-01" },
      { exception_id: "evidence:other", job_id: "c", snoozed_until: null }
    ], error: null });
    h.from.mockReturnValue({ select: () => ({ like }) });
    expect(await listAcknowledgedEvidenceJobIds()).toEqual(new Set(["a"]));
  });
  it("propagates an unauthorised acknowledgement error", async () => {
    const error = { message: "denied" }; h.rpc.mockResolvedValue({ error });
    await expect(acknowledgeMissingEvidence("job-1")).rejects.toEqual(error);
  });
  it("restricts reversal to the exact exception and job", async () => {
    const last = vi.fn().mockResolvedValue({ error: null });
    const first = vi.fn().mockReturnValue({ eq: last });
    h.from.mockReturnValue({ delete: () => ({ eq: first }) });
    await unacknowledgeMissingEvidence("job-1");
    expect(first).toHaveBeenCalledWith("exception_id", "evidence:job-1");
    expect(last).toHaveBeenCalledWith("job_id", "job-1");
  });
});
