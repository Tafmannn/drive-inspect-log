// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InvoiceData } from "@/lib/invoicePdf";

// vi.mock factories are hoisted above const declarations, and emailInvoice.ts
// imports the supabase client statically — the mock fns must be hoisted too.
const { uploadMock, createSignedUrlMock, invokeMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  createSignedUrlMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock("@/lib/invoicePdf", () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: uploadMock,
        createSignedUrl: createSignedUrlMock,
      }),
    },
    functions: { invoke: invokeMock },
  },
}));

import { emailInvoice } from "@/features/invoicing/api/emailInvoice";

const pdfData: InvoiceData = {
  invoiceNumber: "AX-INV-0042",
  issueDate: "2026-07-18",
  clientName: "BCA",
  lineItems: [{ description: "Transport", quantity: 1, unitPrice: 100 }],
  vatRate: 20,
};

const input = {
  invoiceId: "inv-1",
  invoiceNumber: "AX-INV-0042",
  orgId: "org-1",
  pdfData,
  to: "billing@client.com",
};

describe("emailInvoice", () => {
  beforeEach(() => {
    uploadMock.mockReset().mockResolvedValue({ error: null });
    createSignedUrlMock.mockReset().mockResolvedValue({
      data: { signedUrl: "https://example.com/signed.pdf" },
      error: null,
    });
    invokeMock.mockReset().mockResolvedValue({ data: { sent: true }, error: null });
  });

  it("uploads to the org-scoped path and invokes send-invoice-email with the confirmed recipient", async () => {
    const result = await emailInvoice(input);

    expect(result).toEqual({ recipient: "billing@client.com" });
    expect(uploadMock).toHaveBeenCalledWith(
      "org-1/AXENTRA_INV_AX-INV-0042.pdf",
      expect.any(Blob),
      { contentType: "application/pdf", upsert: true }
    );
    expect(invokeMock).toHaveBeenCalledWith("send-invoice-email", {
      body: {
        to: "billing@client.com",
        invoiceId: "inv-1",
        downloadUrl: "https://example.com/signed.pdf",
      },
    });
  });

  it("throws when the upload fails and never invokes the send function", async () => {
    uploadMock.mockResolvedValue({ error: { message: "quota exceeded" } });

    await expect(emailInvoice(input)).rejects.toThrow(/quota exceeded/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("throws when the edge function does not confirm the send", async () => {
    invokeMock.mockResolvedValue({ data: { error: "EMAIL_SEND_FAILED" }, error: null });

    await expect(emailInvoice(input)).rejects.toThrow(/EMAIL_SEND_FAILED/);
  });

  it("sanitises unusual invoice numbers in the storage path", async () => {
    await emailInvoice({ ...input, invoiceNumber: "INV/2026 #7" });

    expect(uploadMock).toHaveBeenCalledWith(
      "org-1/AXENTRA_INV_INV_2026__7.pdf",
      expect.any(Blob),
      expect.any(Object)
    );
  });
});
