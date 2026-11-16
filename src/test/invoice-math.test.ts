import { describe, it, expect } from "vitest";
import {
  buildInvoiceDraft,
  chargeForExpense,
  displayStatus,
  dueDateFor,
  fmtDmy,
  jobLineDescription,
  jobRoute,
  jobsHeaderSubtitle,
  outwardCode,
  paymentTermDays,
  paymentTermsLabel,
  round2,
  type BillableExpense,
  type InvoiceJob,
} from "@/features/invoicing/lib/invoiceMath";

function job(over: Partial<InvoiceJob> & { id: string }): InvoiceJob {
  return {
    external_job_number: null,
    vehicle_reg: "AB12 CDE",
    vehicle_make: "Ford",
    vehicle_model: "Transit",
    job_date: "2026-11-02",
    completed_at: null,
    total_price: 100,
    pickup_city: "Leeds",
    pickup_postcode: "LS11 5AB",
    delivery_city: "Bristol",
    delivery_postcode: "BS34 7QQ",
    ...over,
  };
}

function expense(over: Partial<BillableExpense> & { id: string; job_id: string }): BillableExpense {
  return {
    date: "2026-11-02",
    category: "Fuel",
    supplier: null,
    label: null,
    amount: 60,
    vat_amount: null,
    receipts: [{ url: "https://example.com/r.jpg" }],
    ...over,
  };
}

describe("round2", () => {
  it("rounds half-pennies up despite binary float drift", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(54.6)).toBe(54.6);
  });
});

describe("chargeForExpense", () => {
  it("VAT off: recharges the full amount paid, whatever VAT is recorded", () => {
    expect(chargeForExpense({ amount: 54.6, vat_amount: 9.1 }, false)).toEqual({ gross: 54.6, vat: 9.1, charged: 54.6 });
    expect(chargeForExpense({ amount: 54.6, vat_amount: null }, false).charged).toBe(54.6);
  });

  it("VAT on: recharges net of the VAT recorded on the expense", () => {
    expect(chargeForExpense({ amount: 54.6, vat_amount: 9.1 }, true)).toEqual({ gross: 54.6, vat: 9.1, charged: 45.5 });
  });

  it("VAT on with no VAT recorded: recharges gross (e.g. ULEZ, or VAT unknown)", () => {
    expect(chargeForExpense({ amount: 12.5, vat_amount: null }, true)).toEqual({ gross: 12.5, vat: 0, charged: 12.5 });
  });

  it("ignores a VAT amount that is not less than the amount paid", () => {
    expect(chargeForExpense({ amount: 10, vat_amount: 10 }, true).charged).toBe(10);
    expect(chargeForExpense({ amount: 10, vat_amount: -3 }, true).charged).toBe(10);
  });
});

describe("job line formatting", () => {
  it("takes the outward half of a postcode, spaced or not", () => {
    expect(outwardCode("LS11 5AB")).toBe("LS11");
    expect(outwardCode("ls115ab")).toBe("LS11");
    expect(outwardCode("M1 1AE")).toBe("M1");
    expect(outwardCode("M11AE")).toBe("M1");
    expect(outwardCode("")).toBe("");
    expect(outwardCode(null)).toBe("");
  });

  it("builds the route from both ends, or nothing if an end is missing", () => {
    expect(jobRoute(job({ id: "j1" }))).toBe("Leeds LS11 - Bristol BS34");
    expect(jobRoute(job({ id: "j1", delivery_city: null, delivery_postcode: null }))).toBe("");
  });

  it("formats the invoice line and falls back to the vehicle when there is no route", () => {
    expect(jobLineDescription(job({ id: "j1", external_job_number: "AX1042" }))).toBe(
      "AX1042 | 02/11/2026 | AB12 CDE | Leeds LS11 - Bristol BS34",
    );
    expect(
      jobLineDescription(job({ id: "abcdef12-0000", pickup_city: null, pickup_postcode: null })),
    ).toBe("ABCDEF12 | 02/11/2026 | AB12 CDE | Ford Transit");
  });

  it("formats date-only values without a timezone day shift", () => {
    expect(fmtDmy("2026-11-02")).toBe("02/11/2026");
    expect(fmtDmy(null)).toBe("");
    expect(fmtDmy("not a date")).toBe("");
  });
});

describe("buildInvoiceDraft", () => {
  const jobs = [
    job({ id: "j2", external_job_number: "AX1043", job_date: "2026-11-03", total_price: 95 }),
    job({ id: "j1", external_job_number: "AX1042", job_date: "2026-11-02", total_price: 185 }),
    job({ id: "j3", external_job_number: "AX1044", job_date: "2026-11-04", total_price: 140 }),
  ];
  const expenses = [
    expense({ id: "e3", job_id: "j2", amount: 44.66, vat_amount: 7.44 }),
    expense({ id: "e2", job_id: "j1", category: "Tolls", amount: 8.9, vat_amount: 1.48, date: "2026-11-02" }),
    expense({ id: "e1", job_id: "j1", amount: 54.6, vat_amount: 9.1, date: "2026-11-02" }),
  ];

  it("VAT off: no VAT, expenses at gross, one line per job in date order", () => {
    const d = buildInvoiceDraft({ jobs, expenses, vatRegistered: false, vatRate: 20 });

    expect(d.lineItems.map((l) => l.job_ref)).toEqual(["AX1042", "AX1043", "AX1044"]);
    expect(d.transportTotal).toBe(420);
    expect(d.expensesTotal).toBe(108.16);
    expect(d.subtotal).toBe(528.16);
    expect(d.vatRate).toBe(0);
    expect(d.vatAmount).toBe(0);
    expect(d.total).toBe(528.16);
  });

  it("VAT on: expenses net of their VAT, then VAT on the whole invoice", () => {
    const d = buildInvoiceDraft({ jobs, expenses, vatRegistered: true, vatRate: 20 });

    // 45.50 + 7.42 + 37.22
    expect(d.expensesTotal).toBe(90.14);
    expect(d.subtotal).toBe(510.14);
    expect(d.vatAmount).toBe(102.03);
    expect(d.total).toBe(612.17);
  });

  it("numbers receipts R01.. in document order (job, then date, then id) and stores the snapshot", () => {
    const d = buildInvoiceDraft({ jobs, expenses, vatRegistered: false });

    expect(d.expenseLines.map((l) => [l.ref, l.expense_id, l.job_id])).toEqual([
      ["R01", "e1", "j1"],
      ["R02", "e2", "j1"],
      ["R03", "e3", "j2"],
    ]);
    expect(d.expenseLines[1]).toMatchObject({
      category: "Tolls",
      amount_gross: 8.9,
      amount_vat: 1.48,
      amount_charged: 8.9,
      sort_order: 1,
    });
  });

  it("puts each job's expenses on its own line with the receipt refs", () => {
    const d = buildInvoiceDraft({ jobs, expenses, vatRegistered: false });

    expect(d.lineItems[0]).toMatchObject({
      amount: 185,
      expense_amount: 63.5,
      detail: "Expenses: Fuel £54.60 (R01), Tolls £8.90 (R02)",
      job_date: "2026-11-02",
    });
    // A job with no expenses carries no expense fields at all.
    expect(d.lineItems[2]).not.toHaveProperty("detail");
    expect(d.lineItems[2]).not.toHaveProperty("expense_amount");
  });

  it("gives invoice_items the full line value so summed items equal the subtotal", () => {
    const d = buildInvoiceDraft({ jobs, expenses, vatRegistered: false });

    expect(d.items[0]).toMatchObject({ job_id: "j1", unit_price: 248.5, amount: 248.5, quantity: 1 });
    expect(round2(d.items.reduce((s, i) => s + i.amount, 0))).toBe(d.subtotal);
  });

  it("ignores expenses for jobs that are not on the invoice", () => {
    const d = buildInvoiceDraft({
      jobs: [jobs[1]],
      expenses: [...expenses, expense({ id: "stray", job_id: "not-selected", amount: 999 })],
      vatRegistered: false,
    });

    expect(d.expenseLines.map((l) => l.expense_id)).toEqual(["e1", "e2"]);
    expect(d.total).toBe(248.5);
  });

  it("handles jobs with no price and no expenses", () => {
    const d = buildInvoiceDraft({ jobs: [job({ id: "j9", total_price: null })], expenses: [], vatRegistered: false });
    expect(d.total).toBe(0);
    expect(d.expenseLines).toEqual([]);
  });

  it("keeps pennies exact across many lines", () => {
    const many = Array.from({ length: 30 }, (_, i) => job({ id: `j${String(i).padStart(2, "0")}`, total_price: 33.33 }));
    const exp = many.map((j, i) => expense({ id: `e${i}`, job_id: j.id, amount: 10.01 }));
    const d = buildInvoiceDraft({ jobs: many, expenses: exp, vatRegistered: true, vatRate: 20 });

    expect(d.transportTotal).toBe(999.9);
    expect(d.expensesTotal).toBe(300.3);
    expect(d.vatAmount).toBe(260.04);
    expect(d.total).toBe(1560.24);
    expect(d.expenseLines[29].ref).toBe("R30");
  });
});

describe("payment terms", () => {
  it("reads the number of days from free text", () => {
    expect(paymentTermDays("Net 30")).toBe(30);
    expect(paymentTermDays("net7")).toBe(7);
    expect(paymentTermDays("Payable within 14 days")).toBe(14);
    expect(paymentTermDays("Due on receipt")).toBe(0);
    expect(paymentTermDays("")).toBeNull();
    expect(paymentTermDays("End of month")).toBeNull();
  });

  it("derives the due date, across a month and year end", () => {
    expect(dueDateFor("2026-11-14", "Net 30")).toBe("2026-12-14");
    expect(dueDateFor("2026-12-20", "Net 30")).toBe("2027-01-19");
    expect(dueDateFor("2026-11-14", "Due on receipt")).toBe("2026-11-14");
    expect(dueDateFor("2026-11-14", null)).toBeNull();
  });

  it("words 'Net N' for the client and passes other text through", () => {
    expect(paymentTermsLabel("Net 30")).toBe("Payable within 30 days");
    expect(paymentTermsLabel("Net 0")).toBe("Payable on receipt");
    expect(paymentTermsLabel("30 days from end of month")).toBe("30 days from end of month");
    expect(paymentTermsLabel(null)).toBeUndefined();
  });
});

describe("jobsHeaderSubtitle", () => {
  it("summarises the job count and date range", () => {
    expect(jobsHeaderSubtitle(["2026-11-02", "2026-11-12", "2026-11-05"], 3)).toBe("3 jobs | 2 - 12 November 2026");
    expect(jobsHeaderSubtitle(["2026-11-02"], 1)).toBe("1 job | 2 November 2026");
    expect(jobsHeaderSubtitle(["2026-10-28", "2026-11-04"], 2)).toBe("2 jobs | 28 October - 4 November 2026");
    expect(jobsHeaderSubtitle(["2026-12-30", "2027-01-02"], 2)).toBe("2 jobs | 30 December 2026 - 2 January 2027");
    expect(jobsHeaderSubtitle([null, undefined, ""], 4)).toBe("4 jobs");
  });
});

describe("displayStatus", () => {
  it("derives overdue from a sent invoice past its due date", () => {
    expect(displayStatus({ status: "sent", due_date: "2026-11-01" }, "2026-11-14")).toBe("overdue");
    expect(displayStatus({ status: "sent", due_date: "2026-11-14" }, "2026-11-14")).toBe("sent");
    expect(displayStatus({ status: "sent", due_date: null }, "2026-11-14")).toBe("sent");
  });

  it("never marks a draft, paid or cancelled invoice overdue", () => {
    for (const status of ["draft", "paid", "cancelled"]) {
      expect(displayStatus({ status, due_date: "2020-01-01" }, "2026-11-14")).toBe(status);
    }
    expect(displayStatus({ status: null, due_date: null })).toBe("draft");
  });
});
