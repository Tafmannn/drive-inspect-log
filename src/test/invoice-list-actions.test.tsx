/**
 * The invoice list and its actions: which actions each status offers, and
 * that each one calls the right operation and reports the outcome.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { InvoiceRecord } from "@/features/invoicing/hooks/useInvoices";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
// Radix menus / selects call these; jsdom does not implement them.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});

const h = vi.hoisted(() => {
  const fn = () => null as unknown as ReturnType<typeof import("vitest").vi.fn>;
  return {
    getInvoicePdf: fn(), markInvoiceSent: fn(), markInvoicePaid: fn(), markInvoiceUnpaid: fn(), cancelInvoice: fn(),
    buildInvoicePack: fn(), emailInvoice: fn(), buildInvoiceDocument: fn(), prepareInvoiceDelivery: fn(), markPreparedInvoiceSent: fn(),
    defer: vi.fn(),
    downloads: [] as string[],
    toasts: [] as { title?: string; description?: string; variant?: string }[],
    changed: [] as string[],
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/features/invoicing/api/invoiceCorrectionRequests", () => ({ deferInvoiceCorrection: (...a: unknown[]) => h.defer(...a) }));
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => h.toasts.push(t) }));
vi.mock("@/features/invoicing/api/invoiceLifecycle", () => ({
  PAYMENT_METHODS: [
    { value: "bank_transfer", label: "Bank transfer" },
    { value: "cash", label: "Cash" },
  ],
  getInvoicePdf: (...a: unknown[]) => h.getInvoicePdf(...a),
  markInvoiceSent: (...a: unknown[]) => h.markInvoiceSent(...a),
  markInvoicePaid: (...a: unknown[]) => h.markInvoicePaid(...a),
  markInvoiceUnpaid: (...a: unknown[]) => h.markInvoiceUnpaid(...a),
  cancelInvoice: (...a: unknown[]) => h.cancelInvoice(...a),
}));
vi.mock("@/features/invoicing/api/receiptExport", () => ({
  buildInvoicePack: (...a: unknown[]) => h.buildInvoicePack(...a),
  downloadBlob: (_b: Blob, name: string) => h.downloads.push(name),
}));
vi.mock("@/features/invoicing/api/invoiceDelivery", () => ({
  buildCompleteInvoiceDelivery: (...a: unknown[]) => h.buildInvoicePack(...a),
  prepareInvoiceDelivery: (...a: unknown[]) => h.prepareInvoiceDelivery(...a),
  markPreparedInvoiceSent: (...a: unknown[]) => h.markPreparedInvoiceSent(...a),
}));
vi.mock("@/features/invoicing/api/emailInvoice", () => ({
  emailInvoice: (...a: unknown[]) => h.emailInvoice(...a),
}));
vi.mock("@/features/invoicing/api/invoiceDocument", () => ({
  buildInvoiceDocument: (...a: unknown[]) => h.buildInvoiceDocument(...a),
}));
vi.mock("@/components/PodEmailConfirmDialog", () => ({
  PodEmailConfirmDialog: (p: { open: boolean; defaultEmail: string; documentLabel: string; onConfirm: (e: string) => void; onOpenChange: (o: boolean) => void }) =>
    p.open ? (
      <div role="dialog" aria-label="email">
        <p>{p.documentLabel}</p>
        <button onClick={() => p.onConfirm(p.defaultEmail || "typed@client.example")}>Send email</button>
        <button onClick={() => p.onOpenChange(false)}>Close email</button>
      </div>
    ) : null,
}));

import { useInvoiceActions } from "@/features/invoicing/hooks/useInvoiceActions";
import { InvoiceList, InvoiceStatusBadge } from "@/features/invoicing/components/InvoiceList";

const SETTINGS = { orgId: "org-1", vatRegistered: false, business: { name: "Axentra" } };

function inv(over: Partial<InvoiceRecord> & { invoice_number: string }): InvoiceRecord {
  return {
    id: over.invoice_number, client_name: "Chris", client_company: "CJE Transport", client_email: "ap@cje.example",
    client_address: null, issue_date: "2026-11-01", due_date: "2099-01-01", payment_terms: null, line_items: [],
    subtotal: 100, vat_rate: 0, vat_amount: 0, total: 100, notes: null, status: "draft", created_at: "2026-11-01",
    document_type: "invoice",
    ...over,
  };
}

function Harness({ invoices, settings = SETTINGS, loading = false }: { invoices: InvoiceRecord[] | undefined; settings?: typeof SETTINGS | null; loading?: boolean }) {
  const { actions, isBusy, dialogs } = useInvoiceActions(settings, { onChanged: (id) => h.changed.push(id) });
  return (
    <>
      <InvoiceList invoices={invoices} isLoading={loading} actions={actions} isBusy={isBusy} />
      {dialogs}
    </>
  );
}

function renderList(invoices: InvoiceRecord[] | undefined, extra: { settings?: typeof SETTINGS | null; loading?: boolean } = {}): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <Harness invoices={invoices} {...extra} />
    </QueryClientProvider>,
  );
  return null;
}

/** Open a row's "more actions" menu and return the menu element. */
async function openMenu(number: string) {
  const trigger = screen.getByRole("button", { name: `More actions for ${number}` });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return within(await screen.findByRole("menu"));
}

async function choose(number: string, item: RegExp) {
  const menu = await openMenu(number);
  fireEvent.click(menu.getByRole("menuitem", { name: item }));
}

beforeEach(() => {
  const blob = new Blob(["pdf"]);
  h.getInvoicePdf = vi.fn().mockResolvedValue(blob);
  h.markInvoiceSent = vi.fn().mockResolvedValue(undefined);
  h.markPreparedInvoiceSent = vi.fn().mockResolvedValue(undefined);
  h.prepareInvoiceDelivery = vi.fn().mockResolvedValue("org-1/prepared.pdf");
  h.markInvoicePaid = vi.fn().mockResolvedValue(undefined);
  h.markInvoiceUnpaid = vi.fn().mockResolvedValue(undefined);
  h.cancelInvoice = vi.fn().mockResolvedValue(null);
  h.defer.mockReset().mockResolvedValue("request-1");
  h.buildInvoicePack = vi.fn().mockResolvedValue({ blob, fileName: "invoice_pack_X.zip", succeeded: 2, failed: [] });
  h.emailInvoice = vi.fn().mockResolvedValue({ recipient: "ap@cje.example", pdfPath: "p" });
  h.buildInvoiceDocument = vi.fn().mockResolvedValue({ invoiceNumber: "X", lineItems: [] });
  h.downloads = [];
  h.toasts = [];
  h.changed = [];
});

describe("InvoiceList", () => {
  it("shows loading and empty states", () => {
    renderList(undefined, { loading: true });
    expect(screen.getByText("Loading invoices…")).toBeTruthy();
  });

  it("shows the empty state", () => {
    renderList([]);
    expect(screen.getByText("No invoices created yet.")).toBeTruthy();
  });

  it("labels each document's status, deriving overdue, and shows the detail that goes with it", () => {
    renderList([
      inv({ invoice_number: "AX-DRAFT" }),
      inv({ invoice_number: "AX-SENT", status: "sent", client_ref: "PO-9" }),
      inv({ invoice_number: "AX-LATE", status: "sent", due_date: "2020-01-01" }),
      inv({ invoice_number: "AX-PAID", status: "paid", paid_at: "2026-11-20" }),
      inv({ invoice_number: "AX-GONE", status: "cancelled", cancel_reason: "Wrong PO" }),
      inv({ invoice_number: "CN26-0001", status: "sent", document_type: "credit_note", total: -100, due_date: null }),
    ]);
    const badge = (n: string) => within(screen.getByText(n).closest("tr")!).getAllByText(/Draft|Sent|Overdue|Paid|Cancelled|Credit note/)[0].textContent;
    expect([badge("AX-DRAFT"), badge("AX-SENT"), badge("AX-LATE"), badge("AX-PAID"), badge("AX-GONE"), badge("CN26-0001")]).toEqual([
      "Draft", "Sent", "Overdue", "Paid", "Cancelled", "Credit note",
    ]);
    expect(screen.getByText("PO PO-9")).toBeTruthy();
    expect(screen.getByText("Paid 20/11/2026")).toBeTruthy();
    expect(screen.getByText("Wrong PO")).toBeTruthy();
    expect(screen.getByText("-£100.00")).toBeTruthy();
  });

  it("offers only the actions each status allows", async () => {
    renderList([
      inv({ invoice_number: "AX-DRAFT" }),
      inv({ invoice_number: "AX-SENT", status: "sent" }),
      inv({ invoice_number: "AX-PAID", status: "paid" }),
      inv({ invoice_number: "AX-GONE", status: "cancelled" }),
      inv({ invoice_number: "CN26-0001", status: "sent", document_type: "credit_note" }),
    ]);
    const items = async (n: string) => {
      const menu = await openMenu(n);
      const names = menu.getAllByRole("menuitem").map((i) => i.textContent);
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
      return names;
    };
    expect(await items("AX-DRAFT")).toEqual(["Download pack (PDF + receipt files)", "Email to client", "Mark as sent", "Cancel invoice…"]);
    expect(await items("AX-SENT")).toEqual(["Download pack (PDF + receipt files)", "Email to client", "Record payment", "Cancel invoice…"]);
    expect(await items("AX-PAID")).toEqual(["Download pack (PDF + receipt files)", "Email to client", "Undo payment", "Cancel invoice…"]);
    expect(await items("AX-GONE")).toEqual(["Download pack (PDF + receipt files)"]);
    expect(await items("CN26-0001")).toEqual(["Email to client"]);
  });

  it("renders a status badge on its own (success card)", () => {
    render(<InvoiceStatusBadge invoice={inv({ invoice_number: "A", status: "paid" })} />);
    expect(screen.getByText("Paid")).toBeTruthy();
  });
});

describe("invoice actions", () => {
  it("downloads the PDF under its invoice file name", async () => {
    renderList([inv({ invoice_number: "AX26-1007", status: "sent" })]);
    fireEvent.click(screen.getByRole("button", { name: "Download AX26-1007" }));
    await waitFor(() => expect(h.downloads).toEqual(["AXENTRA_INV_AX26-1007.pdf"]));
    expect(h.getInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({ id: "AX26-1007" }), SETTINGS);
  });

  it("reports a failed download", async () => {
    h.getInvoicePdf.mockRejectedValue(new Error("storage offline"));
    renderList([inv({ invoice_number: "AX26-1007" })]);
    fireEvent.click(screen.getByRole("button", { name: "Download AX26-1007" }));
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Download failed", description: "storage offline", variant: "destructive" }));
  });

  it("downloads the pack, and flags missing receipts", async () => {
    renderList([inv({ invoice_number: "AX26-1007", status: "sent" })]);
    await choose("AX26-1007", /Download pack/);
    await waitFor(() => expect(h.downloads).toEqual(["invoice_pack_X.zip"]));
    expect(h.toasts[0]).toMatchObject({ title: "Invoice pack downloaded", description: "PDF + 2 receipt files" });

    h.buildInvoicePack.mockResolvedValue({ blob: new Blob(), fileName: "p.zip", succeeded: 1, failed: ["R02 (no receipt on file)"] });
    await choose("AX26-1007", /Download pack/);
    await waitFor(() => expect(h.toasts).toHaveLength(2));
    expect(h.toasts[1]).toMatchObject({ title: "Pack downloaded — 1 receipt missing", variant: "destructive" });
  });

  it("marks a draft as sent and refreshes", async () => {
    renderList([inv({ invoice_number: "AX26-1007" })]);
    await choose("AX26-1007", /Mark as sent/);
    await waitFor(() => expect(h.markPreparedInvoiceSent).toHaveBeenCalledWith(expect.objectContaining({ id: "AX26-1007" }), "org-1", SETTINGS));
    expect(h.changed).toEqual(["AX26-1007"]);
    expect(h.toasts[0].title).toBe("Marked as sent");
  });

  it("will not issue an invoice before the organisation settings have loaded", async () => {
    renderList([inv({ invoice_number: "AX26-1007" })], { settings: null });
    await choose("AX26-1007", /Mark as sent/);
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Could not mark as sent" }));
    expect(h.markPreparedInvoiceSent).not.toHaveBeenCalled();
  });

  it("records a payment with the entered date, method and reference", async () => {
    renderList([inv({ invoice_number: "AX26-1007", status: "sent" })]);
    await choose("AX26-1007", /Record payment/);
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Date received"), { target: { value: "2026-11-20" } });
    fireEvent.change(dialog.getByLabelText("Reference (optional)"), { target: { value: "FPS 123" } });
    fireEvent.click(dialog.getByRole("button", { name: "Record payment" }));

    await waitFor(() => expect(h.markInvoicePaid).toHaveBeenCalledWith("AX26-1007", { paidAt: "2026-11-20", method: "bank_transfer", reference: "FPS 123" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.toasts[0].title).toBe("Payment recorded");
  });

  it("keeps the payment dialog open when recording fails", async () => {
    h.markInvoicePaid.mockRejectedValue(new Error("Only a sent invoice can be marked as paid."));
    renderList([inv({ invoice_number: "AX26-1007", status: "sent" })]);
    await choose("AX26-1007", /Record payment/);
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Record payment" }));
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Could not record the payment" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("undoes a payment", async () => {
    renderList([inv({ invoice_number: "AX26-1007", status: "paid" })]);
    await choose("AX26-1007", /Undo payment/);
    await waitFor(() => expect(h.markInvoiceUnpaid).toHaveBeenCalledWith("AX26-1007"));
    expect(h.toasts[0].title).toBe("Payment removed");
  });

  it("cancels a draft only once a reason is given, with no credit note", async () => {
    renderList([inv({ invoice_number: "AX26-1007" })]);
    await choose("AX26-1007", /Cancel invoice/);
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/never issued, so it is cancelled without a credit note/)).toBeTruthy();
    const confirm = dialog.getByRole("button", { name: "Cancel draft" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Created by mistake" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(h.cancelInvoice).toHaveBeenCalledWith("AX26-1007", "Created by mistake", false, "draft", 100));
    await waitFor(() => expect(h.toasts[0].title).toBe("Draft invoice cancelled"));
  });

  it("cancels an issued invoice with a credit note, and warns about a refund when it was paid", async () => {
    h.cancelInvoice.mockResolvedValue("cn-1");
    renderList([inv({ invoice_number: "AX26-1007", status: "paid" })]);
    await choose("AX26-1007", /Cancel invoice/);
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/cancelled with a credit note for the full amount/)).toBeTruthy();
    expect(dialog.getByText(/refund the client separately/)).toBeTruthy();
    fireEvent.change(dialog.getByLabelText("Reason"), { target: { value: "Wrong PO" } });
    const creditButton = dialog.getByRole("button", { name: "Cancel and raise credit note" }) as HTMLButtonElement;
    expect(creditButton.disabled).toBe(true);
    fireEvent.click(dialog.getByRole("checkbox", { name: /I authorise creation/ }));
    expect(creditButton.disabled).toBe(false);
    fireEvent.click(creditButton);
    await waitFor(() => expect(h.cancelInvoice).toHaveBeenCalledWith("AX26-1007", "Wrong PO", true, "paid", 100));
    await waitFor(() => expect(h.toasts[0].title).toBe("Invoice cancelled — credit note raised"));
    expect(h.changed).toEqual(["AX26-1007"]);
  });

  it("keeps the invoice when the cancel dialog is dismissed", async () => {
    renderList([inv({ invoice_number: "AX26-1007" })]);
    await choose("AX26-1007", /Cancel invoice/);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep invoice" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.cancelInvoice).not.toHaveBeenCalled();
  });

  it("emails a draft with a freshly rendered document (which issues it)", async () => {
    renderList([inv({ invoice_number: "AX26-1007" })]);
    await choose("AX26-1007", /Email to client/);
    fireEvent.click(await screen.findByText("Send email"));

    await waitFor(() => expect(h.emailInvoice).toHaveBeenCalled());
    expect(h.buildInvoiceDocument).toHaveBeenCalledWith(expect.objectContaining({ id: "AX26-1007" }), { settings: SETTINGS, withReceipts: false });
    expect(h.emailInvoice.mock.calls[0][0]).toMatchObject({ invoiceId: "AX26-1007", orgId: "org-1", to: "ap@cje.example", storedPdfPath: "org-1/prepared.pdf" });
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Invoice emailed", description: "AX26-1007 sent to ap@cje.example." }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not email a draft when pack preparation fails", async () => {
    h.prepareInvoiceDelivery.mockRejectedValue(new Error("Invoice pack incomplete: R01"));
    renderList([inv({ invoice_number: "AX26-1007" })]);
    await choose("AX26-1007", /Email to client/);
    fireEvent.click(await screen.findByText("Send email"));
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Invoice email failed", description: "Invoice pack incomplete: R01" }));
    expect(h.emailInvoice).not.toHaveBeenCalled();
  });

  it("re-sends an issued invoice using its stored PDF, never a re-render with receipts", async () => {
    renderList([inv({ invoice_number: "AX26-1007", status: "sent", pdf_url: "org-1/AXENTRA_INV_AX26-1007.pdf" })]);
    await choose("AX26-1007", /Email to client/);
    fireEvent.click(await screen.findByText("Send email"));
    await waitFor(() => expect(h.emailInvoice).toHaveBeenCalled());
    expect(h.emailInvoice.mock.calls[0][0]).toMatchObject({ storedPdfPath: "org-1/AXENTRA_INV_AX26-1007.pdf" });
    expect(h.buildInvoiceDocument).toHaveBeenCalledWith(expect.anything(), { settings: SETTINGS, withReceipts: false });
  });

  it("reports a failed email and leaves the dialog open to retry", async () => {
    h.emailInvoice.mockRejectedValue(new Error("EMAIL_SEND_FAILED"));
    renderList([inv({ invoice_number: "AX26-1007" })]);
    await choose("AX26-1007", /Email to client/);
    fireEvent.click(await screen.findByText("Send email"));
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Invoice email failed", description: "EMAIL_SEND_FAILED" }));
    expect(screen.getByRole("dialog", { name: "email" })).toBeTruthy();
    fireEvent.click(screen.getByText("Close email"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
