import { describe, it, expect } from "vitest";
import { evaluateInvoiceReadiness } from "@/lib/invoiceReadiness";

const base = {
  id: "j1", status: "completed", total_price: 220, client_id: "c1",
  client_name: "Revilo", client_company: "Revilo", client_email: "a@b.co",
};
const ph = (type: string, run = "r1") => ({ id: type, job_id: "j1", type, url: `u/${type}`, run_id: run, created_at: "2026-11-19" }) as any;
const insp = (type: string) => ({ id: type, job_id: "j1", type, driver_signature_url: "d", customer_signature_url: "c", created_at: "2026-11-19" }) as any;

describe("invoice readiness evidence inputs", () => {
  it("is blocked red when the job carries no photos/inspections (the bug)", () => {
    const r = evaluateInvoiceReadiness({ job: { ...base, current_run_id: "r1" }, alreadyInvoiced: false });
    expect(r.ready).toBe(false);
  });
  it("is not blocked on evidence when photos and inspections are supplied", () => {
    const r = evaluateInvoiceReadiness({
      job: { ...base, current_run_id: "r1", photos: [ph("pickup_front"), ph("delivery_front")], inspections: [insp("pickup"), insp("delivery")] },
      alreadyInvoiced: false,
    });
    expect(r.blockers.map((b: any) => b.code)).not.toContain("evidence_red_or_critical");
  });
});
