// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import type { JobWithRelations } from "@/lib/types";

// jsdom has no canvas/Image/fetch pipeline — every image load inside the
// generator fails and falls back to its "Image unavailable" placeholder,
// which is exactly what this smoke test wants: it exercises the full card
// layout (header, detail cards, checklists, damage, photo grids, signatures,
// declaration) and proves none of it throws and a real PDF blob comes out.
vi.mock("@/lib/gcsProxyUrl", () => ({
  resolveImageUrlAsync: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/resolveSignatureUrlSimple", () => ({
  resolveSignatureUrlSimple: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/logger", () => ({
  logClientEvent: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  },
}));

import { generatePodPdf } from "@/lib/podPdf";

function makeJob(): JobWithRelations {
  const pickupInspection = {
    id: "insp-pickup",
    job_id: "job-1",
    type: "pickup",
    inspected_at: "2026-07-12T22:10:00Z",
    inspected_by_name: "Terrence",
    customer_name: "Brian",
    odometer: 56295,
    fuel_level_percent: 25,
    notes: "Handover fine",
    vehicle_condition: "Clean",
    light_condition: "Good",
    mot: "Yes",
    v5: "Yes",
    number_of_keys: 1,
    driver_signature_url: "supabase-sig://jobs/job-1/signatures/pd.png",
    customer_signature_url: "supabase-sig://jobs/job-1/signatures/pc.png",
  };
  const deliveryInspection = {
    id: "insp-delivery",
    job_id: "job-1",
    type: "delivery",
    inspected_at: "2026-07-12T22:12:00Z",
    inspected_by_name: "Terrence",
    customer_name: "BCA",
    odometer: 52395,
    fuel_level_percent: 25,
    driver_signature_url: "supabase-sig://jobs/job-1/signatures/dd.png",
    customer_signature_url: null,
  };

  const photos = Array.from({ length: 7 }, (_, i) => ({
    id: `photo-p-${i}`,
    job_id: "job-1",
    inspection_id: "insp-pickup",
    type: i === 6 ? "damage_close_up" : `pickup_exterior_${i}`,
    url: `https://example.com/photo-${i}.jpg`,
    thumbnail_url: null,
    backend: "internal",
    backend_ref: `jobs/job-1/pickup/photo-${i}.jpg`,
    label: null,
    created_at: "2026-07-12T22:10:00Z",
  }));

  return {
    id: "job-1",
    external_job_number: "AX0063",
    status: "completed",
    vehicle_reg: "OV66BKY",
    vehicle_make: "VAUXHALL",
    vehicle_model: "Corsa",
    vehicle_colour: "BLUE",
    vehicle_year: 2016,
    driver_name: "Terrence",
    pickup_city: "Glasgow",
    delivery_city: "Hart",
    pickup_contact_name: "Brian",
    pickup_contact_phone: "07588384748",
    pickup_address_line1: "Lancefield Street",
    pickup_postcode: "G3 8HZ",
    pickup_company: "Thrifty Car & Van Hire",
    delivery_contact_name: "BCA",
    delivery_contact_phone: "020489598599",
    delivery_address_line1: "BCA Blackbushe",
    delivery_postcode: "GU17 9LG",
    delivery_company: "BCA Blackbushe",
    completed_at: "2026-07-12T23:48:00Z",
    inspections: [pickupInspection, deliveryInspection],
    photos,
    damage_items: [
      {
        id: "dmg-1",
        inspection_id: "insp-pickup",
        area: "Interior",
        item: "Seat",
        damage_types: ["Scratch"],
        notes: null,
      },
    ],
    activity_log: [],
    resolvedDriverName: "Terrence",
  } as unknown as JobWithRelations;
}

describe("generatePodPdf (smoke)", () => {
  it("renders the full card-based POD without throwing and returns a PDF blob", async () => {
    const blob = await generatePodPdf(makeJob(), [
      { id: "e1", category: "fuel", label: "Diesel top-up", amount: 20, billable_on_pod: true },
      { id: "e2", category: "toll", label: null, amount: 5, billable_on_pod: false },
    ]);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1000);

    const head = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5));
    expect(head).toBe("%PDF-");
  });

  it("still renders when the job has no inspections, photos, damages, or expenses", async () => {
    const bare = {
      ...makeJob(),
      inspections: [],
      photos: [],
      damage_items: [],
    } as unknown as JobWithRelations;

    const blob = await generatePodPdf(bare);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
  });
});
