import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The DB guard is exercised against Postgres in release validation; this pins
// the contract the app relies on so it can't be weakened silently.
const sql = readFileSync("supabase/migrations/20261121140000_one_live_invoice_per_job.sql", "utf8");

describe("one live invoice per job — migration contract", () => {
  it("guards both invoices.job_id and invoice_items.job_id", () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_invoices_one_live_per_job[\s\S]*ON public\.invoices/);
    expect(sql).toMatch(/CREATE TRIGGER trg_invoice_items_one_live_per_job[\s\S]*ON public\.invoice_items/);
  });
  it("ignores cancelled invoices, voided lines and credit notes", () => {
    expect(sql).toContain("NEW.status = 'cancelled'");
    expect(sql).toContain("COALESCE(NEW.voided, false)");
    expect(sql).toContain("<> 'invoice'");
  });
  it("serialises writers and raises unique_violation", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("ERRCODE = '23505'");
  });
  it("legacy invoice page handles the 23505 refusal", () => {
    const page = readFileSync("src/pages/InvoiceGenerator.tsx", "utf8");
    expect(page).toContain("isAlreadyInvoicedError(error)");
  });
});
