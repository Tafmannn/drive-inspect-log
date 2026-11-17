/**
 * Client portal: the rules behind invoice payment status, account balance,
 * the move summary, CSV export, pre-filled emails and the progress steps.
 */
import { describe, it, expect } from "vitest";
import {
  daysBetween,
  invoiceBalance,
  invoicePaymentLabel,
  invoicePaymentState,
} from "@/features/portal/lib/invoiceStatus";
import { fmtDuration, moveSummary } from "@/features/portal/lib/moveSummary";
import { toCsv } from "@/features/portal/lib/csv";
import { askAboutInvoiceMailto, askAboutMoveMailto, requestMoveMailto } from "@/features/portal/lib/contact";
import { PROGRESS_STEPS, STAGE_NEXT, progressStepLabel, STAGE_LABEL } from "@/features/portal/lib/portalStatus";
import { fmtDay } from "@/features/portal/lib/format";
import type { PortalContext, PortalInspection } from "@/features/portal/api";

const today = new Date(2026, 10, 17, 10, 0); // 17 Nov 2026, local time
const inv = (over: Record<string, unknown> = {}) => ({
  status: "sent", document_type: "invoice", due_date: "2026-11-27", total: 100, ...over,
});

describe("invoice payment status", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-11-17", "2026-11-27")).toBe(10);
    expect(daysBetween("2026-11-27", "2026-11-17")).toBe(-10);
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1); // across the clocks change
  });

  it("labels due, due tomorrow, due today and overdue invoices", () => {
    expect(invoicePaymentLabel(inv(), today)).toBe("Due in 10 days");
    expect(invoicePaymentLabel(inv({ due_date: "2026-11-18" }), today)).toBe("Due tomorrow");
    expect(invoicePaymentState(inv({ due_date: "2026-11-17" }), today)).toBe("due_today");
    expect(invoicePaymentLabel(inv({ due_date: "2026-11-17" }), today)).toBe("Due today");
    expect(invoicePaymentState(inv({ due_date: "2026-11-12" }), today)).toBe("overdue");
    expect(invoicePaymentLabel(inv({ due_date: "2026-11-12" }), today)).toBe("Overdue · 5 days");
    expect(invoicePaymentLabel(inv({ due_date: "2026-11-16" }), today)).toBe("Overdue · 1 day");
  });

  it("a sent invoice with no due date is awaiting payment", () => {
    expect(invoicePaymentLabel(inv({ due_date: null }), today)).toBe("Awaiting payment");
  });

  it("paid, cancelled and credit notes are never shown as due or overdue", () => {
    const past = { due_date: "2026-01-01" };
    expect(invoicePaymentLabel(inv({ ...past, status: "paid" }), today)).toBe("Paid");
    expect(invoicePaymentLabel(inv({ ...past, status: "cancelled" }), today)).toBe("Cancelled");
    expect(invoicePaymentLabel(inv({ ...past, document_type: "credit_note" }), today)).toBe("Credit note");
  });

  it("balance counts only unpaid invoices, splits out overdue, and finds the next due date", () => {
    const b = invoiceBalance(
      [
        inv({ total: 120.1, due_date: "2026-11-10" }), // overdue
        inv({ total: 80.2, due_date: "2026-11-30" }), // due
        inv({ total: 50, due_date: "2026-11-20" }), // due, sooner
        inv({ total: 999, status: "paid" }),
        inv({ total: 300, status: "cancelled" }),
        inv({ total: 300, document_type: "credit_note" }),
      ],
      today,
    );
    expect(b).toEqual({ outstanding: 250.3, outstandingCount: 3, overdue: 120.1, overdueCount: 1, nextDue: "2026-11-20" });
  });

  it("an empty account owes nothing", () => {
    expect(invoiceBalance([], today)).toEqual({ outstanding: 0, outstandingCount: 0, overdue: 0, overdueCount: 0, nextDue: null });
  });
});

const insp = (over: Partial<PortalInspection>): PortalInspection => ({
  type: "pickup", inspected_at: null, odometer: null, fuel_level_percent: null, number_of_keys: null,
  customer_name: null, inspected_by_name: null, notes: null, has_damage: false, damage: [], ...over,
});
const dmg = { area: "rear", location: "bumper", item: "bumper", damage_types: ["scratch"], notes: null };

describe("move summary", () => {
  it("works out journey time, miles driven and fuel used", () => {
    const s = moveSummary([
      insp({ inspected_at: "2026-11-12T09:15:00Z", odometer: 41250, fuel_level_percent: 75 }),
      insp({ type: "delivery", inspected_at: "2026-11-12T15:35:00Z", odometer: 41289, fuel_level_percent: 63, customer_name: "S. Okafor" }),
    ]);
    expect(s).toMatchObject({ durationMinutes: 380, milesDriven: 39, fuelChange: -12, receivedBy: "S. Okafor", condition: "none" });
    expect(fmtDuration(s.durationMinutes)).toBe("6 h 20 min");
  });

  it("tells pre-existing damage apart from new damage", () => {
    expect(moveSummary([insp({ damage: [dmg] }), insp({ type: "delivery", damage: [dmg] })]).condition).toBe("pre_existing");
    expect(moveSummary([insp({}), insp({ type: "delivery", damage: [dmg] })]).condition).toBe("new");
    expect(moveSummary([insp({}), insp({ type: "delivery", has_damage: true })]).condition).toBe("new");
  });

  it("has no outcome until the vehicle is delivered, and ignores impossible readings", () => {
    const s = moveSummary([insp({ odometer: 500 })]);
    expect(s.condition).toBeNull();
    expect(moveSummary([insp({ odometer: 500 }), insp({ type: "delivery", odometer: 400 })]).milesDriven).toBeNull();
  });

  it("formats durations", () => {
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(45)).toBe("45 min");
    expect(fmtDuration(120)).toBe("2 h");
    expect(fmtDuration(1440 * 2 + 240)).toBe("2 days 4 h");
  });
});

describe("CSV export", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(toCsv(["A", "B"], [["x, y", 'say "hi"'], ["line\nbreak", 5]])).toBe('A,B\r\n"x, y","say ""hi"""\r\n"line\nbreak",5\r\n');
  });

  it("neutralises spreadsheet formulas in client data", () => {
    expect(toCsv(["Name"], [["=HYPERLINK(\"x\")"], ["+44 7700"], ["-5"], ["@sum"]])).toBe(
      "Name\r\n\"'=HYPERLINK(\"\"x\"\")\"\r\n'+44 7700\r\n'-5\r\n'@sum\r\n",
    );
  });

  it("writes empty cells for missing values", () => {
    expect(toCsv(["A", "B"], [[null, undefined]])).toBe("A,B\r\n,\r\n");
  });
});

describe("pre-filled emails", () => {
  const ctx: PortalContext = {
    client: { id: "c", name: "Northgate Motors" },
    operator: { name: "Axentra", logo_url: null, primary_colour: null, contact_email: "bookings@example.com", contact_phone: null },
  };

  it("request a move: addressed to the operator with a booking template", () => {
    const href = requestMoveMailto(ctx)!;
    expect(href.startsWith("mailto:bookings%40example.com?subject=")).toBe(true);
    const body = decodeURIComponent(href.split("body=")[1]);
    expect(decodeURIComponent(href.split("subject=")[1].split("&")[0])).toBe("Vehicle move request: Northgate Motors");
    expect(body).toContain("Vehicle registration:");
    expect(body).toContain("Preferred date:");
  });

  it("ask about a move or invoice: carries the registration, reference or invoice number", () => {
    const move = decodeURIComponent(askAboutMoveMailto(ctx, { job_ref: "AX0071", vehicle_reg: "LK24 HXP" }, "https://app/portal/jobs/1")!);
    expect(move).toContain("Question about LK24 HXP (ref AX0071)");
    expect(move).toContain("https://app/portal/jobs/1");
    expect(decodeURIComponent(askAboutInvoiceMailto(ctx, "INV-0142")!)).toContain("Question about invoice INV-0142");
  });

  it("offers no email link when the operator has no contact email", () => {
    const none = { ...ctx, operator: { ...ctx.operator, contact_email: null } };
    expect(requestMoveMailto(none)).toBeNull();
    expect(askAboutMoveMailto(none, { job_ref: "A", vehicle_reg: "B" })).toBeNull();
    expect(askAboutInvoiceMailto(none, "X")).toBeNull();
  });
});

describe("progress steps and wording", () => {
  it("has five steps, with Out for delivery between In transit and Delivered", () => {
    expect([...PROGRESS_STEPS]).toEqual(["booked", "collected", "in_transit", "delivering", "delivered"]);
    expect(progressStepLabel("delivering", "current")).toBe("Out for delivery");
  });

  it("says Collecting while it happens and Collected once done", () => {
    expect(progressStepLabel("collected", "current")).toBe("Collecting");
    expect(progressStepLabel("collected", "done")).toBe("Collected");
    expect(progressStepLabel("collected", "upcoming")).toBe("Collected");
  });

  it("explains what happens next for every stage", () => {
    for (const stage of Object.keys(STAGE_LABEL)) expect(STAGE_NEXT[stage as keyof typeof STAGE_NEXT]).toBeTruthy();
  });

  it("describes scheduled dates relative to today", () => {
    expect(fmtDay("2026-11-17", today)).toBe("Today");
    expect(fmtDay("2026-11-18", today)).toBe("Tomorrow");
    expect(fmtDay("2026-11-16", today)).toBe("Yesterday");
    expect(fmtDay("2026-11-20", today)).toBe("Fri 20 Nov");
    expect(fmtDay("2027-01-05", today)).toBe("Tue 5 Jan 2027");
    expect(fmtDay(null, today)).toBe("—");
  });
});
