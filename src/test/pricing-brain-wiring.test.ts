/**
 * Stage 8 wiring tests — proves invoice prep uses ONLY total_price,
 * never the advisory suggestedPrice.
 */
import { describe, it, expect } from "vitest";
import { suggestJobPrice } from "@/lib/pricingBrain";
import { mergeDefaults } from "@/lib/pricingDefaults";
import { evaluateInvoiceReadiness, type InvoiceReadinessJob } from "@/lib/invoiceReadiness";
import type { Inspection, Photo } from "@/lib/types";

const RUN = "run-X";

const ph = (type: string): Photo =>
  ({
    id: "ph-" + type,
    job_id: "job-1",
    inspection_id: null,
    type,
    url: "https://x/y.jpg",
    thumbnail_url: null,
    backend: "googleCloud",
    backend_ref: null,
    label: null,
    created_at: "2026-01-01T00:00:00Z",
    run_id: RUN,
    archived_at: null,
  }) as Photo;

const insp = (type: "pickup" | "delivery"): Inspection =>
  ({
    id: "i-" + type,
    job_id: "job-1",
    type,
    odometer: null,
    fuel_level_percent: null,
    vehicle_condition: null,
    light_condition: null,
    oil_level_status: null,
    water_level_status: null,
    notes: null,
    handbook: null,
    service_book: null,
    mot: null,
    v5: null,
    parcel_shelf: null,
    spare_wheel_status: null,
    tool_kit: null,
    tyre_inflation_kit: null,
    locking_wheel_nut: null,
    sat_nav_working: null,
    alloys_or_trims: null,
    alloys_damaged: null,
    wheel_trims_damaged: null,
    number_of_keys: null,
    ev_charging_cables: null,
    aerial: null,
    customer_paperwork: null,
    has_damage: false,
    inspected_at: "2026-01-01T00:00:00Z",
    inspected_by_name: "Driver",
    customer_name: "Customer",
    driver_signature_url: "sig://d",
    customer_signature_url: "sig://c",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }) as Inspection;

const baseJob = (over: Partial<InvoiceReadinessJob> = {}): InvoiceReadinessJob => ({
  id: "job-1",
  status: "completed",
  total_price: 250,
  client_id: "client-1",
  client_name: "Acme",
  client_company: "Acme Ltd",
  client_email: "ap@acme.test",
  client_phone: "+44 7000",
  current_run_id: RUN,
  inspections: [insp("pickup"), insp("delivery")],
  photos: [ph("pickup_exterior_front"), ph("delivery_exterior_front")],
  ...over,
});

describe("Stage 8 wiring — pricing brain is advisory only", () => {
  it("suggestion is marked isFinalInvoicePrice=false", () => {
    const s = suggestJobPrice({ routeMiles: 100, urgency: "standard" });
    expect(s.isFinalInvoicePrice).toBe(false);
  });

  it("invoice readiness blocks when total_price is null even if a suggestion exists", () => {
    const suggestion = suggestJobPrice({ routeMiles: 80, urgency: "standard" });
    expect(suggestion.suggestedPrice).toBeGreaterThan(0);

    const job = baseJob({ total_price: null });
    const r = evaluateInvoiceReadiness({ job, alreadyInvoiced: false, receiptCount: 1 });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.toLowerCase().includes("price"))).toBe(true);
  });

  it("invoice readiness uses total_price (not the suggestion) when both differ", () => {
    const suggestion = suggestJobPrice({ routeMiles: 500, urgency: "urgent" });
    const job = baseJob({ total_price: 99 }); // far below suggestion
    const r = evaluateInvoiceReadiness({ job, alreadyInvoiced: false, receiptCount: 1 });
    // Job is ready because total_price > 0; the advisory suggestion is irrelevant.
    expect(r.ready).toBe(true);
    expect(suggestion.suggestedPrice).not.toBe(99);
  });

  it("missing route miles produces null suggestion + warning, not a guess", () => {
    const s = suggestJobPrice({ routeMiles: null, urgency: "standard" });
    expect(s.suggestedPrice).toBeNull();
    expect(s.missingInputs).toContain("route_miles");
  });

  it("admin override is preserved verbatim and never replaced by computed price", () => {
    const s = suggestJobPrice({
      adminOverridePrice: 175,
      routeMiles: 500, // would normally compute much higher
      urgency: "urgent",
    });
    expect(s.suggestedPrice).toBe(175);
    expect(s.confidence).toBe("high");
    expect(s.isFinalInvoicePrice).toBe(false);
  });
});

describe("Stage 8 wiring — pricing defaults loader", () => {
  it("mergeDefaults falls back to PRICING_DEFAULTS for missing/invalid fields", () => {
    const merged = mergeDefaults({ MIN_CHARGE: 75 });
    expect(merged.MIN_CHARGE).toBe(75);
    // Untouched fields keep defaults
    expect(merged.MIN_RATE_PER_MILE).toBeGreaterThan(0);
    expect(merged.URGENCY_MULTIPLIERS.urgent).toBeGreaterThan(1);
  });

  it("mergeDefaults rejects non-positive numbers and uses fallback", () => {
    const merged = mergeDefaults({ MIN_CHARGE: -10, MIN_RATE_PER_MILE: 0 });
    expect(merged.MIN_CHARGE).toBe(50); // pricingBrain default
    expect(merged.MIN_RATE_PER_MILE).toBe(1.2);
  });

  it("mergeDefaults handles null/undefined raw input", () => {
    expect(() => mergeDefaults(null)).not.toThrow();
    expect(() => mergeDefaults(undefined)).not.toThrow();
    const merged = mergeDefaults(null);
    expect(merged.MIN_CHARGE).toBe(50);
  });
});
