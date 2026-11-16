import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * createMultiJobInvoice with rechargeable expenses: what gets written, the
 * double-billing guards, and that a half-written invoice is rolled back.
 */
type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  invoicedItems: [] as Row[],
  legacyInvoices: [] as Row[],
  invoicedExpenses: [] as Row[],
  inserts: [] as { table: string; rows: Row | Row[] }[],
  deletes: [] as { table: string; id: unknown }[],
  failInsert: {} as Record<string, { code?: string; message: string } | undefined>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: "AX26-1007", error: null }),
    from: (table: string) => ({
      select: () => ({
        in: () => {
          if (table === "invoice_items") return Promise.resolve({ data: db.invoicedItems, error: null });
          if (table === "invoices") return Promise.resolve({ data: db.legacyInvoices, error: null });
          if (table === "invoice_expenses") return Promise.resolve({ data: db.invoicedExpenses, error: null });
          throw new Error(`unexpected select on ${table}`);
        },
      }),
      insert: (rows: Row | Row[]) => {
        db.inserts.push({ table, rows });
        const error = db.failInsert[table] ?? null;
        const result = { data: error ? null : { id: "inv-new" }, error };
        // invoices: .insert().select().single(); line tables: awaited directly.
        return Object.assign(Promise.resolve({ error }), {
          select: () => ({ single: () => Promise.resolve(result) }),
        });
      },
      delete: () => ({
        eq: (_col: string, id: unknown) => {
          db.deletes.push({ table, id });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  },
}));

import { createMultiJobInvoice, findAlreadyInvoicedJobs } from "@/features/invoicing/api/createInvoice";
import type { EligibleJob } from "@/features/invoicing/hooks/useInvoicePrepData";
import type { BillableExpense } from "@/features/invoicing/lib/invoiceMath";
import type { Client } from "@/lib/clientApi";

const client: Client = {
  id: "client-1",
  org_id: "org-1",
  name: "Chris Ellsworth",
  company: "CJE Transport",
  email: "chris@cje.example",
  phone: null,
  address: "1 Yard Lane",
  notes: null,
  is_active: true,
  created_at: "",
  updated_at: "",
  billing_email: "accounts@cje.example",
  billing_address: "Accounts Dept, 1 Yard Lane",
  payment_terms: "Net 30",
};

function job(id: string, price: number, date: string): EligibleJob {
  return {
    id,
    external_job_number: id.toUpperCase(),
    vehicle_reg: "AB12 CDE",
    vehicle_make: "Ford",
    vehicle_model: "Transit",
    job_date: date,
    completed_at: null,
    total_price: price,
    distance_miles: null,
    client_id: "client-1",
    client_company: "CJE Transport",
    client_name: "Chris",
    client_email: null,
    client_phone: null,
    status: "completed",
  };
}

function expense(id: string, jobId: string, amount: number, category = "Fuel"): BillableExpense {
  return { id, job_id: jobId, date: "2026-11-02", category, supplier: "Shell", label: null, amount, vat_amount: null, receipts: [] };
}

const jobs = [job("j1", 185, "2026-11-02"), job("j2", 95, "2026-11-03")];
const base = { client, jobs, vatRegistered: false, vatRate: 20, orgId: "org-1" };

function inserted(table: string): Row[] {
  const hit = db.inserts.find((i) => i.table === table);
  return hit ? (Array.isArray(hit.rows) ? hit.rows : [hit.rows]) : [];
}

beforeEach(() => {
  db.invoicedItems = [];
  db.legacyInvoices = [];
  db.invoicedExpenses = [];
  db.inserts = [];
  db.deletes = [];
  db.failInsert = {};
});

describe("createMultiJobInvoice", () => {
  it("writes the header with no VAT while the business is not VAT registered", async () => {
    const result = await createMultiJobInvoice({
      ...base,
      expenses: [expense("e1", "j1", 54.6), expense("e2", "j2", 8.9, "Tolls")],
      clientRef: "  PO-4500123 ",
    });

    const [header] = inserted("invoices");
    expect(header).toMatchObject({
      org_id: "org-1",
      client_id: "client-1",
      invoice_number: "AX26-1007",
      status: "draft",
      client_ref: "PO-4500123",
      // billing contact wins over the general contact
      client_email: "accounts@cje.example",
      client_address: "Accounts Dept, 1 Yard Lane",
      payment_terms: "Payable within 30 days",
      vat_registered: false,
      vat_rate: 0,
      vat_amount: 0,
      expenses_total: 63.5,
      subtotal: 343.5,
      total: 343.5,
    });
    expect(header.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toMatchObject({ invoiceId: "inv-new", invoiceNumber: "AX26-1007", jobCount: 2 });
  });

  it("charges VAT on the whole invoice once the business is VAT registered", async () => {
    await createMultiJobInvoice({ ...base, vatRegistered: true, expenses: [expense("e1", "j1", 50)] });

    expect(inserted("invoices")[0]).toMatchObject({
      vat_registered: true,
      vat_rate: 20,
      subtotal: 330,
      vat_amount: 66,
      total: 396,
    });
  });

  it("writes one item per job and one snapshot row per recharged expense", async () => {
    await createMultiJobInvoice({ ...base, expenses: [expense("e1", "j1", 54.6), expense("e2", "j2", 8.9, "Tolls")] });

    expect(inserted("invoice_items")).toEqual([
      expect.objectContaining({ invoice_id: "inv-new", job_id: "j1", amount: 239.6, sort_order: 0 }),
      expect.objectContaining({ invoice_id: "inv-new", job_id: "j2", amount: 103.9, sort_order: 1 }),
    ]);
    const lines = inserted("invoice_expenses");
    expect(lines).toEqual([
      expect.objectContaining({ invoice_id: "inv-new", expense_id: "e1", job_id: "j1", ref: "R01", category: "Fuel", supplier: "Shell", amount_gross: 54.6, amount_charged: 54.6 }),
      expect.objectContaining({ invoice_id: "inv-new", expense_id: "e2", job_id: "j2", ref: "R02", category: "Tolls", amount_charged: 8.9 }),
    ]);
    // Receipt file refs are not a column — they must not be sent to the DB.
    expect(lines[0]).not.toHaveProperty("receipts");
  });

  it("writes no invoice_expenses rows when nothing is recharged", async () => {
    await createMultiJobInvoice(base);
    expect(db.inserts.map((i) => i.table)).toEqual(["invoices", "invoice_items"]);
    expect(inserted("invoices")[0]).toMatchObject({ expenses_total: 0, total: 280 });
  });

  it("never bills an expense whose job is not on the invoice", async () => {
    await createMultiJobInvoice({ ...base, expenses: [expense("e1", "j1", 10), expense("stray", "other-job", 999)] });

    expect(inserted("invoice_expenses").map((l) => l.expense_id)).toEqual(["e1"]);
    expect(inserted("invoices")[0]).toMatchObject({ total: 290 });
  });

  it("refuses a job that is already invoiced", async () => {
    db.invoicedItems = [{ job_id: "j1", voided: false }];
    await expect(createMultiJobInvoice(base)).rejects.toThrow(/already invoiced: J1/);
    expect(db.inserts).toEqual([]);
  });

  it("refuses an expense that is already on another invoice", async () => {
    db.invoicedExpenses = [{ expense_id: "e1", voided: false }];
    await expect(createMultiJobInvoice({ ...base, expenses: [expense("e1", "j1", 10)] })).rejects.toThrow(
      /1 selected expense is already on another invoice/,
    );
    expect(db.inserts).toEqual([]);
  });

  it("allows a job and expense released by a cancelled invoice", async () => {
    db.invoicedItems = [{ job_id: "j1", voided: true }];
    db.legacyInvoices = [{ job_id: "j2", status: "cancelled" }];
    db.invoicedExpenses = [{ expense_id: "e1", voided: true }];

    await expect(createMultiJobInvoice({ ...base, expenses: [expense("e1", "j1", 10)] })).resolves.toMatchObject({
      invoiceNumber: "AX26-1007",
    });
  });

  it("requires a PO when the client demands one, before anything is written", async () => {
    const poClient = { ...client, po_required: true };
    await expect(createMultiJobInvoice({ ...base, client: poClient, clientRef: "   " })).rejects.toThrow(/requires a PO/);
    expect(db.inserts).toEqual([]);
    await expect(createMultiJobInvoice({ ...base, client: poClient, clientRef: "PO-1" })).resolves.toBeTruthy();
  });

  it("rolls the invoice back when saving the expense lines fails", async () => {
    db.failInsert.invoice_expenses = { message: "boom" };
    await expect(createMultiJobInvoice({ ...base, expenses: [expense("e1", "j1", 10)] })).rejects.toThrow(
      /Failed to save invoice expenses: boom/,
    );
    expect(db.deletes).toEqual([{ table: "invoices", id: "inv-new" }]);
  });

  it("explains a concurrent double-bill of an expense (unique violation) and rolls back", async () => {
    db.failInsert.invoice_expenses = { code: "23505", message: "duplicate key" };
    await expect(createMultiJobInvoice({ ...base, expenses: [expense("e1", "j1", 10)] })).rejects.toThrow(
      /just billed on another invoice/,
    );
    expect(db.deletes).toEqual([{ table: "invoices", id: "inv-new" }]);
  });

  it("rolls back when saving the job lines fails", async () => {
    db.failInsert.invoice_items = { code: "23505", message: "duplicate key" };
    await expect(createMultiJobInvoice(base)).rejects.toThrow(/just invoiced on another invoice/);
    expect(db.deletes).toEqual([{ table: "invoices", id: "inv-new" }]);
    expect(inserted("invoice_expenses")).toEqual([]);
  });
});

describe("findAlreadyInvoicedJobs with cancelled invoices", () => {
  it("does not count voided items or cancelled legacy invoices", async () => {
    db.invoicedItems = [{ job_id: "j1", voided: true }, { job_id: "j2", voided: false }];
    db.legacyInvoices = [{ job_id: "j3", status: "cancelled" }, { job_id: "j4", status: "draft" }];

    const ids = await findAlreadyInvoicedJobs(["j1", "j2", "j3", "j4"]);
    expect([...ids].sort()).toEqual(["j2", "j4"]);
  });
});
