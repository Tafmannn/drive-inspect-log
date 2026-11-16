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

describe("emailPodPdf when the branded email can't be sent", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("returns the server's reason and does not share anything by itself", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const message = "This job's customer email is onfile@example.com. Send it there, or ask an admin to send it to a different address.";
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: new Response(JSON.stringify({ error: "RECIPIENT_NOT_ON_FILE", message }), { status: 403 }) },
    });

    const result = await emailPodPdf(makeJob(), [], "someone-else@example.com");

    expect(result.method).toBe("failed");
    if (result.method !== "failed") throw new Error("unreachable");
    expect(result.message).toBe(message);
    expect(share).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("only shares when asked, with a tidy message and no 'Dear Customer'", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    invokeMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await emailPodPdf(makeJob(), [], "x@example.com");
    if (result.method !== "failed") throw new Error("expected failure");
    expect(result.message).toBe("The email couldn't be sent. Please try again.");

    await result.shareManually();
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as { title: string; text: string };
    expect(arg.title).toBe("Proof of Delivery – OV66BKY (AX0063)");
    expect(arg.text).toContain("Proof of Delivery (PDF):\nhttps://example.com/signed.pdf");
    expect(arg.text).toContain("Glasgow → Hart");
    expect(arg.text).not.toContain("Dear Customer");
  });

  it("says why when the network call itself fails", async () => {
    invokeMock.mockRejectedValue(new Error("offline"));
    const result = await emailPodPdf(makeJob(), [], "x@example.com");
    expect(result).toMatchObject({ method: "failed", message: expect.stringContaining("Couldn't reach the email service") });
  });
});
