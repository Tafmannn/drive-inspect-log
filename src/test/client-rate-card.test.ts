/**
 * Client rate card tests.
 *
 * These tests verify pricingBrain correctly applies client-specific rate cards
 * over the org defaults, while preserving safety guarantees:
 *   - rate-per-mile from card overrides default rate
 *   - minimum charge from card overrides default minimum
 *   - flat agreed price applies but respects minimum charge
 *   - inactive rate cards must NOT be passed to pricingBrain (caller filters)
 *   - suggestion is never the final invoice price
 */
import { describe, it, expect } from "vitest";
import { suggestJobPrice, PRICING_DEFAULTS } from "@/lib/pricingBrain";
import { evaluateInvoiceReadiness, type InvoiceReadinessJob } from "@/lib/invoiceReadiness";
import type { Inspection, Photo } from "@/lib/types";

describe("Client rate cards — pricing brain integration", () => {
  it("client rate per mile overrides the default rate", () => {
    const defaultRate = PRICING_DEFAULTS.MIN_RATE_PER_MILE;
    const clientRate = defaultRate + 1.5; // clearly distinct

    const sDefault = suggestJobPrice({
      routeMiles: 100,
      ratePerMile: defaultRate,
      urgency: "standard",
    });
    const sClient = suggestJobPrice({
      routeMiles: 100,
      ratePerMile: defaultRate,
      urgency: "standard",
      clientRateCard: { ratePerMile: clientRate },
    });

    expect(sClient.suggestedPrice).not.toBe(sDefault.suggestedPrice);
    expect(sClient.suggestedPrice).toBe(Math.round(100 * clientRate * 100) / 100);
    // Reason mentions the client rate card source
    expect(sClient.reasons.some((r) => /client rate/i.test(r))).toBe(true);
  });

  it("client minimum charge overrides the default minimum", () => {
    const s = suggestJobPrice({
      routeMiles: 1, // tiny job — would normally floor to default min
      ratePerMile: 1,
      minimumCharge: PRICING_DEFAULTS.MIN_CHARGE, // org default
      clientRateCard: { minimumCharge: 200 }, // bespoke contract
    });
    expect(s.suggestedPrice).toBe(200);
  });

  it("flat agreed price is applied but respects the higher minimum charge", () => {
    const s = suggestJobPrice({
      routeMiles: 200,
      clientRateCard: { agreedPrice: 30, minimumCharge: 75 },
    });
    // agreedPrice 30 < min 75 → floored to 75
    expect(s.suggestedPrice).toBe(75);
    expect(s.reasons.some((r) => /flat price/i.test(r))).toBe(true);
    expect(s.reasons.some((r) => /minimum/i.test(r))).toBe(true);
  });

  it("flat agreed price is used verbatim when above the minimum", () => {
    const s = suggestJobPrice({
      routeMiles: 200,
      clientRateCard: { agreedPrice: 250, minimumCharge: 50 },
    });
    expect(s.suggestedPrice).toBe(250);
  });

  it("inactive rate cards are filtered by the caller (omitted from inputs) — falls back to defaults", () => {
    // Caller policy: when rate_card_active=false we DO NOT pass clientRateCard.
    // Simulate that here — the inactive card has no effect on the suggestion.
    const sActive = suggestJobPrice({
      routeMiles: 50,
      ratePerMile: 1.2,
      clientRateCard: { ratePerMile: 5 }, // hypothetically very high
    });
    const sIgnored = suggestJobPrice({
      routeMiles: 50,
      ratePerMile: 1.2,
      // clientRateCard omitted — represents inactive rate card filtered upstream
    });
    expect(sActive.suggestedPrice).not.toBe(sIgnored.suggestedPrice);
    expect(sIgnored.suggestedPrice).toBe(Math.round(50 * 1.2 * 100) / 100);
  });

  it("suggestion is never marked as a final invoice price", () => {
    const s = suggestJobPrice({
      routeMiles: 100,
      clientRateCard: { ratePerMile: 2, minimumCharge: 100 },
    });
    expect(s.isFinalInvoicePrice).toBe(false);
  });
});

/* ─── Invoice readiness independence ────────────────────────────── */

const RUN = "run-Y";
const ph = (type: string): Photo =>
  ({
    id: "ph-" + type,
    job_id: "job-2",
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
    job_id: "job-2",
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
  id: "job-2",
  status: "completed",
  total_price: 320,
  client_id: "client-99",
  client_name: "Acme",
  client_company: "Acme Ltd",
  client_email: "ap@acme.test",
  client_phone: "+44 7000",
  current_run_id: RUN,
  inspections: [insp("pickup"), insp("delivery")],
  photos: [ph("pickup_exterior_front"), ph("delivery_exterior_front")],
  ...over,
});

describe("Client rate cards — invoice readiness independence", () => {
  it("invoice readiness uses total_price even when a client rate card would suggest a different number", () => {
    // The brain would suggest 100 × 2 = 200; but the persisted total_price is 320.
    const suggestion = suggestJobPrice({
      routeMiles: 100,
      clientRateCard: { ratePerMile: 2, minimumCharge: 50 },
    });
    expect(suggestion.suggestedPrice).toBe(200);

    const job = baseJob({ total_price: 320 });
    const r = evaluateInvoiceReadiness({ job, alreadyInvoiced: false, receiptCount: 1 });
    expect(r.ready).toBe(true);
    // total_price is the source of truth, not the suggestion
    expect(job.total_price).toBe(320);
  });

  it("invoice readiness blocks when total_price is missing, regardless of any client rate card suggestion", () => {
    const suggestion = suggestJobPrice({
      routeMiles: 100,
      clientRateCard: { agreedPrice: 500 },
    });
    expect(suggestion.suggestedPrice).toBe(500);

    const job = baseJob({ total_price: null });
    const r = evaluateInvoiceReadiness({ job, alreadyInvoiced: false, receiptCount: 1 });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.code === "missing_price")).toBe(true);
  });
});
