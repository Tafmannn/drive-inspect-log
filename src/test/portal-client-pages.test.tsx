// @vitest-environment jsdom
/**
 * Client portal pages, from the client's side: the moves overview, a single
 * move, the invoice list and an invoice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const h = vi.hoisted(() => ({
  jobs: [] as unknown[],
  job: null as unknown,
  evidence: undefined as unknown,
  invoices: [] as unknown[],
  invoice: null as unknown,
  ctx: undefined as unknown,
  csv: [] as { name: string; csv: string }[],
  jobsQuery: {} as Record<string, unknown>,
  invoicesQuery: {} as Record<string, unknown>,
}));

vi.mock("@/features/portal/api", () => ({
  usePortalJobs: () => ({ data: h.jobs, isLoading: false, error: null, dataUpdatedAt: Date.UTC(2026, 10, 17, 9, 30), refetch: () => {}, ...h.jobsQuery }),
  usePortalJob: () => ({ data: h.job, isLoading: false, error: null, dataUpdatedAt: Date.UTC(2026, 10, 17, 9, 30) }),
  usePortalEvidence: () => ({ data: h.evidence, isLoading: false }),
  usePortalInvoices: () => ({ data: h.invoices, isLoading: false, error: null, refetch: () => {}, ...h.invoicesQuery }),
  usePortalInvoice: () => ({ data: h.invoice, isLoading: false, error: null }),
  usePortalContext: () => ({ data: h.ctx }),
}));
vi.mock("@/features/portal/lib/csv", async (orig) => ({
  ...(await orig<typeof import("@/features/portal/lib/csv")>()),
  downloadCsv: (name: string, csv: string) => h.csv.push({ name, csv }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {} }));

import PortalJobs from "@/features/portal/pages/PortalJobs";
import PortalJobDetail from "@/features/portal/pages/PortalJobDetail";
import PortalInvoices from "@/features/portal/pages/PortalInvoices";
import PortalInvoiceDetail from "@/features/portal/pages/PortalInvoiceDetail";

const ctx = {
  client: { id: "c1", name: "Northgate Motors" },
  operator: { name: "Axentra", logo_url: null, primary_colour: null, contact_email: "bookings@example.com", contact_phone: "01632 960000" },
};
const job = (over: Record<string, unknown>) => ({
  id: "j", job_ref: "AX1", vehicle_reg: "AB12 CDE", vehicle_make: "Ford", vehicle_model: "Puma", vehicle_colour: null,
  pickup_city: "York", pickup_postcode: "YO1", delivery_city: "Leeds", delivery_postcode: "LS1", job_date: null,
  status: "assigned", created_at: "2026-11-10T09:00:00Z", completed_at: null, ...over,
});
const thisMonth = new Date();
const isoThisMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1, 12).toISOString();

// Due dates relative to the real today, so the "Overdue" logic is exercised for real.
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const invoice = (over: Record<string, unknown>) => ({
  id: "i", invoice_number: "INV-1", issue_date: day(-20), due_date: day(10), subtotal: 100, vat_amount: 20, total: 120,
  sent_at: "2026-11-01T10:00:00Z", status: "sent", document_type: "invoice", paid_at: null, ...over,
});

function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname + loc.search}</span>;
}

beforeEach(() => {
  h.jobsQuery = {};
  h.invoicesQuery = {};
  h.ctx = ctx;
  h.csv = [];
  h.jobs = [
    job({ id: "a1", job_ref: "AX71", vehicle_reg: "LK24 HXP", status: "in_transit", job_date: day(0) }),
    job({ id: "a2", job_ref: "AX72", vehicle_reg: "YD73 KTE", status: "delivery_in_progress" }),
    job({ id: "a3", job_ref: "AX73", vehicle_reg: "MA22 ZRC", status: "failed" }),
    job({ id: "d1", job_ref: "AX68", vehicle_reg: "WR21 ONB", status: "completed", completed_at: isoThisMonth }),
    job({ id: "d2", job_ref: "AX50", vehicle_reg: "SN70 FGU", status: "completed", completed_at: "2025-01-10T12:00:00Z" }),
  ];
  h.invoices = [
    invoice({ id: "i1", invoice_number: "INV-OVER", due_date: day(-5), total: 300 }),
    invoice({ id: "i2", invoice_number: "INV-DUE", due_date: day(3), total: 120 }),
    invoice({ id: "i3", invoice_number: "INV-PAID", status: "paid", paid_at: "2026-11-14T12:00:00Z", total: 999 }),
  ];
});
afterEach(() => cleanup());

describe("Vehicle moves overview", () => {
  const renderList = (url = "/portal") =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/portal" element={<><PortalJobs /><LocationProbe /></>} />
          <Route path="/portal/jobs/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

  it("summarises what's on the road, what's been delivered and what's owed", () => {
    renderList();
    const summary = within(screen.getByRole("region", { name: "Summary" }));
    expect(summary.getByText("In progress").parentElement!.textContent).toContain("3");
    expect(summary.getByText("Delivered this month").parentElement!.textContent).toContain("1");
    const owed = summary.getByText("Awaiting payment").parentElement!;
    expect(owed.textContent).toContain("£420.00");
    expect(owed.textContent).toContain("£300.00 overdue");
  });

  it("shows the scheduled date and an Out for delivery step on live moves, and flags problems", () => {
    renderList();
    expect(screen.getByText(/Scheduled Today/)).toBeTruthy();
    const delivering = screen.getByText("YD73 KTE").closest("a")!;
    expect(within(delivering).getAllByText("Out for delivery").length).toBe(2); // badge + current step
    expect(screen.getByText(/Something needs our attention/)).toBeTruthy();
  });

  it("keeps the tab, search and date range in the address, and filters by them", () => {
    renderList();
    fireEvent.click(screen.getByRole("tab", { name: /Completed/ }));
    expect(screen.getByTestId("loc").textContent).toBe("/portal?tab=completed");
    expect(screen.getByText("WR21 ONB")).toBeTruthy();
    expect(screen.getByText("SN70 FGU")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "90" } });
    expect(screen.queryByText("SN70 FGU")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search vehicle moves"), { target: { value: "wr21" } });
    expect(screen.getByTestId("loc").textContent).toBe("/portal?tab=completed&range=90&q=wr21");
  });

  it("restores the list from the address when the client comes back", () => {
    renderList("/portal?tab=completed&q=sn70");
    expect(screen.getByText("SN70 FGU")).toBeTruthy();
    expect(screen.queryByText("WR21 ONB")).toBeNull();
  });

  it("downloads the visible list as CSV", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /Download CSV/ }));
    expect(h.csv).toHaveLength(1);
    expect(h.csv[0].name).toMatch(/^vehicle-moves-active-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(h.csv[0].csv.split("\r\n")[0]).toBe("Reference,Registration,Vehicle,From,To,Scheduled,Delivered,Status");
    expect(h.csv[0].csv).toContain("AX72,YD73 KTE,Ford · Puma,York YO1,Leeds LS1,,,Out for delivery");
  });

  it("offers a pre-filled move request, but only when the operator has an email", () => {
    renderList();
    expect(screen.getByRole("link", { name: /Request a move/ }).getAttribute("href")).toMatch(/^mailto:bookings%40example\.com/);
    cleanup();
    h.ctx = { ...ctx, operator: { ...ctx.operator, contact_email: null } };
    renderList();
    expect(screen.queryByRole("link", { name: /Request a move/ })).toBeNull();
  });

  it("never shows a zero while loading or after a failed load", () => {
    h.jobsQuery = { data: undefined, isLoading: true };
    h.invoicesQuery = { data: undefined, isLoading: true };
    renderList();
    const summary = within(screen.getByRole("region", { name: "Summary" }));
    expect(summary.getByLabelText("In progress: loading")).toBeTruthy();
    expect(summary.getByLabelText("Awaiting payment: loading")).toBeTruthy();
    expect(summary.queryByText("£0.00")).toBeNull();
    expect(screen.getByRole("status", { name: "Loading your vehicle moves" })).toBeTruthy();
    cleanup();

    h.jobsQuery = { data: undefined, error: new Error("boom") };
    h.invoicesQuery = { data: undefined, error: new Error("boom") };
    renderList();
    const failed = within(screen.getByRole("region", { name: "Summary" }));
    expect(failed.queryByText("0")).toBeNull();
    expect(failed.queryByText("£0.00")).toBeNull();
    expect(failed.queryByText("All paid up")).toBeNull();
    expect(failed.getAllByText("Couldn't load right now")).toHaveLength(3);
    expect(screen.getByRole("alert").textContent).toContain("We couldn't load your vehicle moves.");
  });

  it("filters by a status the client actually has, and keeps it in the address", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    // Only stages present among the live moves are offered.
    expect(screen.queryByRole("button", { name: "Delivered" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
    expect(screen.getByTestId("loc").textContent).toBe("/portal?stage=issue");
    expect(screen.getByText("MA22 ZRC")).toBeTruthy();
    expect(screen.queryByText("LK24 HXP")).toBeNull();
  });

  it("explains an empty search and clears it in one tap", () => {
    renderList("/portal?q=zz99");
    expect(screen.getByText("No moves match “zz99”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
    expect(screen.getByTestId("loc").textContent).toBe("/portal");
    expect(screen.getByText("LK24 HXP")).toBeTruthy();
  });

  it("says plainly when nothing is on the road", () => {
    h.jobs = [];
    renderList();
    expect(screen.getByText("No vehicle moves in progress")).toBeTruthy();
    expect(screen.getByText("Your active vehicle movements will appear here once a booking is confirmed.")).toBeTruthy();
  });

  it("is all paid up when nothing is owed", () => {
    h.invoices = [];
    renderList();
    expect(screen.getByText("All paid up")).toBeTruthy();
  });
});

describe("A single move", () => {
  const delivered = {
    job: {
      ...job({ id: "d1", status: "completed", completed_at: "2026-11-12T15:30:00Z" }),
      vehicle_year: "2021", pickup_address_line1: "1 Road", pickup_address_line2: null, pickup_contact_name: null,
      delivery_address_line1: "2 Street", delivery_address_line2: null, delivery_contact_name: null, earliest_delivery_date: null,
    },
    timeline: [{ status: "completed", at: "2026-11-12T15:30:00Z" }],
    inspections: [
      { type: "pickup", inspected_at: "2026-11-12T09:00:00Z", odometer: 100, fuel_level_percent: 50, number_of_keys: "2",
        customer_name: "R. Patel", inspected_by_name: "Driver", notes: null, has_damage: true,
        damage: [{ area: "rear", location: "bumper", item: "bumper", damage_types: ["scratch"], notes: null }] },
      { type: "delivery", inspected_at: "2026-11-12T12:30:00Z", odometer: 160, fuel_level_percent: 50, number_of_keys: "2",
        customer_name: "S. Okafor", inspected_by_name: "Driver", notes: null, has_damage: false, damage: [] },
    ],
  };
  const renderDetail = (state?: unknown) =>
    render(
      <MemoryRouter initialEntries={[{ pathname: "/portal/jobs/d1", state }]}>
        <Routes><Route path="/portal/jobs/:jobId" element={<PortalJobDetail />} /></Routes>
      </MemoryRouter>,
    );

  beforeEach(() => {
    h.job = delivered;
    h.evidence = {
      photos: [
        { id: "p1", type: "pickup_front", label: "Front", inspection_type: "pickup", url: "https://x/front.jpg" },
        { id: "p2", type: "pickup_rear", label: "Rear", inspection_type: "pickup", url: "https://x/rear.jpg" },
      ],
      signatures: [{ inspection_type: "delivery", signer: "customer", url: "https://x/sig.png" }],
      unavailable: 0,
    };
  });

  it("summarises the delivery: condition, journey time, miles and who received it", () => {
    renderDetail();
    expect(screen.getByText(/Delivered with no damage recorded/)).toBeTruthy();
    expect(screen.getByText("3 h 30 min")).toBeTruthy();
    expect(screen.getByText("60 mi")).toBeTruthy();
    expect(screen.getAllByText("S. Okafor").length).toBeGreaterThan(0);
    expect(screen.getByText("Unchanged (50%)")).toBeTruthy();
    expect(document.title).toContain("AB12 CDE");
  });

  it("names a damage item once, not three times", () => {
    renderDetail();
    expect(screen.getByText(/^Rear · Bumper — Scratch$/)).toBeTruthy();
  });

  it("opens photos in an in-page viewer and steps through them", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "View photo: Front" }));
    expect(screen.getByText("Collection report · 1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("Collection report · 2 of 2")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Collection report · 1 of 2")).toBeTruthy();
  });

  it("lets the client ask about this move with the details filled in", () => {
    renderDetail();
    const href = decodeURIComponent(screen.getByRole("link", { name: /Ask about this move/ }).getAttribute("href")!);
    expect(href).toContain("Question about AB12 CDE (ref AX1)");
  });

  it("goes back to the list the client came from", () => {
    renderDetail({ back: "/portal?tab=completed&q=wr21" });
    expect(screen.getByRole("link", { name: /All moves/ }).getAttribute("href")).toBe("/portal?tab=completed&q=wr21");
    cleanup();
    renderDetail({ back: "https://evil.example" });
    expect(screen.getByRole("link", { name: /All moves/ }).getAttribute("href")).toBe("/portal");
  });

  it("shows the schedule and what happens next on a live move, with no delivery summary", () => {
    h.job = {
      ...delivered,
      job: { ...delivered.job, status: "assigned", job_date: day(1), earliest_delivery_date: "2026-12-01" },
      inspections: [],
    };
    renderDetail();
    expect(screen.getByText(/Scheduled Tomorrow/)).toBeTruthy();
    expect(screen.getByText(/Deliver no earlier than 1 Dec 2026/)).toBeTruthy();
    expect(screen.getByText(/A driver has been assigned/)).toBeTruthy();
    expect(screen.queryByText("Delivery summary")).toBeNull();
  });

  it("reassures the client when the only damage was already there at collection", () => {
    h.job = {
      ...delivered,
      inspections: [delivered.inspections[0], { ...delivered.inspections[1], has_damage: true, damage: delivered.inspections[0].damage }],
    };
    renderDetail();
    expect(screen.getByText(/No new damage: only damage already recorded at collection/)).toBeTruthy();
  });

  it("warns when new damage was recorded at delivery", () => {
    h.job = {
      ...delivered,
      inspections: [
        { ...delivered.inspections[0], has_damage: false, damage: [] },
        { ...delivered.inspections[1], has_damage: true, damage: [{ area: "front", location: "wing", item: "wing", damage_types: ["dent"], notes: null }] },
      ],
    };
    renderDetail();
    expect(screen.getByText(/New damage recorded at delivery/)).toBeTruthy();
  });
});

describe("Invoices", () => {
  const renderInvoices = (url = "/portal/invoices") =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/portal/invoices" element={<PortalInvoices />} /></Routes>
      </MemoryRouter>,
    );

  it("summarises outstanding, overdue and paid totals", () => {
    renderInvoices();
    expect(screen.getByText("Outstanding").parentElement!.textContent).toContain("£420.00");
    expect(screen.getByText("Overdue").parentElement!.textContent).toContain("£300.00");
    const paidCard = screen.getAllByText("Paid").find((el) => el.parentElement?.textContent?.includes("£999.00"));
    expect(paidCard).toBeTruthy();
  });

  it("badges every invoice with its payment status and shows when it was paid", () => {
    renderInvoices();
    expect(screen.getByText("Overdue · 5 days")).toBeTruthy();
    expect(screen.getByText("Due in 3 days")).toBeTruthy();
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(1);
    expect(screen.getByText(/Paid 14 Nov 2026/)).toBeTruthy();
  });

  it("filters to unpaid or paid", () => {
    renderInvoices("/portal/invoices?show=unpaid");
    expect(screen.getByText("INV-OVER")).toBeTruthy();
    expect(screen.queryByText("INV-PAID")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Paid" }));
    expect(screen.getByText("INV-PAID")).toBeTruthy();
    expect(screen.queryByText("INV-OVER")).toBeNull();
  });

  it("says so when there is nothing to pay", () => {
    h.invoices = [invoice({ status: "paid" })];
    renderInvoices("/portal/invoices?show=unpaid");
    expect(screen.getByText("Nothing to pay. You're all up to date.")).toBeTruthy();
  });

  it("shows a retry, not empty totals, when invoices fail to load", () => {
    h.invoicesQuery = { data: undefined, error: new Error("boom") };
    renderInvoices();
    expect(screen.getByRole("alert").textContent).toContain("We couldn't load your invoices.");
    expect(screen.queryByText("£0.00")).toBeNull();
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy();
  });

  it("downloads the invoice list as CSV", () => {
    renderInvoices();
    fireEvent.click(screen.getByRole("button", { name: /Download CSV/ }));
    expect(h.csv[0].csv.split("\r\n")[0]).toBe("Number,Type,Issued,Due,Net,VAT,Total,Status,Paid on");
    expect(h.csv[0].csv).toContain("INV-OVER,Invoice");
  });
});

describe("An invoice", () => {
  const detail = (over: Record<string, unknown>) => ({
    ...invoice({}), client_ref: null, vat_registered: true, pdf_path: null, credits_invoice_number: null,
    payment_terms: "14 days", client_name: "Northgate Motors", client_company: "Northgate Motors", client_email: null,
    client_address: null, notes: null, vat_rate: 20, job_ref: "AX68", vehicle_reg: "WR21 ONB",
    items: [{ description: "Move", quantity: 1, unit_price: 100, amount: 100 }], line_items: [],
    operator: { name: "Axentra", legal_name: null, logo_url: null, registered_address: null, vat_number: null, company_number: null },
    ...over,
  });
  const renderInvoice = () =>
    render(
      <MemoryRouter initialEntries={["/portal/invoices/i1"]}>
        <Routes><Route path="/portal/invoices/:invoiceId" element={<PortalInvoiceDetail />} /></Routes>
      </MemoryRouter>,
    );

  it("says plainly when it is overdue", () => {
    h.invoice = detail({ due_date: day(-5) });
    renderInvoice();
    expect(screen.getByText(/This invoice is 5 days overdue: £120\.00 was due on/)).toBeTruthy();
  });

  it("thanks the client and shows the date once paid", () => {
    h.invoice = detail({ status: "paid", paid_at: "2026-11-14T12:00:00Z" });
    renderInvoice();
    expect(screen.getByText("Paid on 14 Nov 2026. Thank you.")).toBeTruthy();
  });

  it("links to the move it is for, and offers a pre-filled question", () => {
    h.invoice = detail({});
    renderInvoice();
    expect(screen.getByRole("link", { name: /View move/ }).getAttribute("href")).toBe("/portal/jobs/d1");
    expect(decodeURIComponent(screen.getByRole("link", { name: /Ask about this invoice/ }).getAttribute("href")!)).toContain(
      "Question about invoice INV-1",
    );
  });

  it("does not repeat the client name when it matches the company", () => {
    h.invoice = detail({});
    renderInvoice();
    expect(screen.getAllByText("Northgate Motors")).toHaveLength(1);
  });

  it("offers no move link when the invoice names a move the client can't see", () => {
    h.invoice = detail({ job_ref: "ZZ999" });
    renderInvoice();
    expect(screen.queryByRole("link", { name: /View move/ })).toBeNull();
  });
});
