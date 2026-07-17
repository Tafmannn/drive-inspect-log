// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobWithRelations } from "@/lib/types";

// Mirrors the setup in pod-pdf-smoke.test.ts — jsdom has no canvas/Image,
// every embedded image resolves to a placeholder, which is fine here since
// this test is only exercising the recipient-resolution logic.
vi.mock("@/lib/gcsProxyUrl", () => ({
  resolveImageUrlAsync: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/resolveSignatureUrlSimple", () => ({
  resolveSignatureUrlSimple: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));

const invokeMock = vi.fn();
const uploadMock = vi.fn().mockResolvedValue({ error: null });
const createSignedUrlMock = vi.fn().mockResolvedValue({
  data: { signedUrl: "https://example.com/signed.pdf" },
});
const getSessionMock = vi.fn().mockResolvedValue({
  data: { session: { user: { id: "user-1" } } },
});
const maybeSingleMock = vi.fn().mockResolvedValue({ data: { org_id: "org-1" } });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    storage: {
      from: () => ({
        upload: uploadMock,
        createSignedUrl: createSignedUrlMock,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: maybeSingleMock,
        }),
      }),
    }),
    functions: { invoke: invokeMock },
  },
}));

import { emailPodPdf } from "@/lib/podPdf";

function makeJob(overrides: Partial<JobWithRelations> = {}): JobWithRelations {
  return {
    id: "job-1",
    external_job_number: "AX0063",
    status: "completed",
    vehicle_reg: "OV66BKY",
    vehicle_make: "VAUXHALL",
    vehicle_model: "Corsa",
    pickup_city: "Glasgow",
    delivery_city: "Hart",
    delivery_contact_email: "onfile@example.com",
    pickup_contact_email: "pickup-onfile@example.com",
    completed_at: "2026-07-12T23:48:00Z",
    inspections: [],
    photos: [],
    damage_items: [],
    activity_log: [],
    ...overrides,
  } as unknown as JobWithRelations;
}

describe("emailPodPdf recipient resolution", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    uploadMock.mockClear();
    createSignedUrlMock.mockClear();
    invokeMock.mockResolvedValue({ data: { sent: true }, error: null });
  });

  it("sends to the admin-confirmed override, not the job's stored contact email", async () => {
    const job = makeJob();
    const result = await emailPodPdf(job, [], "confirmed@correct-address.com");

    expect(result).toEqual({ method: "resend", recipient: "confirmed@correct-address.com" });
    expect(invokeMock).toHaveBeenCalledWith(
      "send-pod-email",
      expect.objectContaining({ body: expect.objectContaining({ to: "confirmed@correct-address.com" }) })
    );
  });

  it("falls back to the job's stored contact email when no override is given", async () => {
    const job = makeJob();
    const result = await emailPodPdf(job, []);

    expect(result).toEqual({ method: "resend", recipient: "onfile@example.com" });
  });

  it("trims whitespace on the override before using it", async () => {
    const job = makeJob();
    const result = await emailPodPdf(job, [], "  spaced@example.com  ");

    expect(result).toEqual({ method: "resend", recipient: "spaced@example.com" });
  });

  it("an empty override does not suppress the stored contact email fallback", async () => {
    const job = makeJob();
    const result = await emailPodPdf(job, [], "   ");

    expect(result).toEqual({ method: "resend", recipient: "onfile@example.com" });
  });
});
