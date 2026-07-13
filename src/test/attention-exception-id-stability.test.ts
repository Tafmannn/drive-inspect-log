import { describe, it, expect, afterEach, vi } from "vitest";
import {
  deriveTimingExceptions,
  deriveComplianceExceptions,
} from "@/features/attention/engine/exceptionEngine";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Regression: exception IDs must be stable over time so acknowledgements
 * (keyed on the id via attention_acknowledgements) survive refetches. These
 * exceptions embed a *live* elapsed value in their display text; the id must
 * NOT change as that value ticks.
 */

afterEach(() => {
  vi.useRealTimers();
});

function jobInPickup(updatedAt: string): Tables<"jobs"> {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    external_job_number: "JOB-1",
    org_id: "org-1",
    status: "pickup_in_progress",
    updated_at: updatedAt,
  } as unknown as Tables<"jobs">;
}

describe("attention exception id stability", () => {
  it("timing exception id is identical 5 minutes apart", () => {
    // Job entered pickup 2h ago — comfortably over any threshold.
    const updatedAt = "2026-07-01T10:00:00.000Z";
    const job = [jobInPickup(updatedAt)];

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
    const first = deriveTimingExceptions(job);
    expect(first.length).toBeGreaterThan(0);

    vi.setSystemTime(new Date("2026-07-01T12:05:00.000Z"));
    const second = deriveTimingExceptions(job);

    expect(second.length).toBe(first.length);
    // The detail text (elapsed minutes) has changed…
    expect(second[0].detail).not.toBe(first[0].detail);
    // …but the id — what acknowledgements key on — must be unchanged.
    expect(second[0].id).toBe(first[0].id);
  });

  it("licence-expiry compliance id is identical across days", () => {
    const driver = {
      user_id: "driver-9",
      full_name: "Sam Driver",
      org_id: "org-1",
      licence_expiry: "2026-07-20", // within the warn window
      right_to_work: "verified",
      bank_captured: true,
      is_active: true,
      archived_at: null,
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T09:00:00.000Z"));
    const day1 = deriveComplianceExceptions([], [driver]);
    const lic1 = day1.find((e) => e.title.includes("Licence expires"));
    expect(lic1).toBeTruthy();

    vi.setSystemTime(new Date("2026-07-11T09:00:00.000Z"));
    const day2 = deriveComplianceExceptions([], [driver]);
    const lic2 = day2.find((e) => e.title.includes("Licence expires"));
    expect(lic2).toBeTruthy();

    // Title changes (fewer days left) but the id stays put.
    expect(lic2!.title).not.toBe(lic1!.title);
    expect(lic2!.id).toBe(lic1!.id);
  });
});
