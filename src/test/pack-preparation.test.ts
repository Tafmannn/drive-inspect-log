import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("@/features/invoicing/api/invoiceDelivery", () => ({
  prepareInvoiceDelivery: (...a: unknown[]) => h.prepare(...a),
}));

import {
  preparePackOnce,
  startPackInBackground,
  getPackState,
  resetPackPreparation,
} from "@/features/invoicing/api/packPreparation";
import type { InvoiceRecord } from "@/features/invoicing/hooks/useInvoices";

const draft = { id: "inv-1", status: "draft", document_type: "invoice" } as InvoiceRecord;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  resetPackPreparation();
  h.prepare.mockReset();
});

describe("background pack preparation", () => {
  it("a Send during a background build joins it instead of building a second pack", async () => {
    const d = deferred<string>();
    h.prepare.mockImplementation((_r: unknown, _o: unknown, _s: unknown, progress: (m: string) => void) => {
      progress("Building POD 1 of 2 (AB12 CDE)…");
      return d.promise;
    });
    startPackInBackground(draft, "org-1", null);
    expect(getPackState("inv-1")).toEqual({ state: "building", message: "Building POD 1 of 2 (AB12 CDE)…" });

    const send = preparePackOnce(draft, "org-1", null);
    expect(h.prepare).toHaveBeenCalledTimes(1);
    d.resolve("org-1/pack.pdf");
    await expect(send).resolves.toBe("org-1/pack.pdf");
    expect(getPackState("inv-1")).toEqual({ state: "ready", path: "org-1/pack.pdf" });
  });

  it("a failed background build is reported, never thrown, and the next Send tries again", async () => {
    h.prepare.mockRejectedValueOnce(new Error("Invoice pack incomplete: R01"));
    startPackInBackground(draft, "org-1", null);
    await vi.waitFor(() => expect(getPackState("inv-1")).toEqual({ state: "failed", error: "Invoice pack incomplete: R01" }));

    h.prepare.mockResolvedValueOnce("org-1/pack.pdf");
    await expect(preparePackOnce(draft, "org-1", null)).resolves.toBe("org-1/pack.pdf");
    expect(h.prepare).toHaveBeenCalledTimes(2);
  });

  it("does nothing for issued invoices and credit notes", () => {
    startPackInBackground({ ...draft, status: "sent" } as InvoiceRecord, "org-1", null);
    startPackInBackground({ ...draft, document_type: "credit_note" } as InvoiceRecord, "org-1", null);
    expect(h.prepare).not.toHaveBeenCalled();
  });
});
