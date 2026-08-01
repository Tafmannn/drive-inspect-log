// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

import { parsePushPayload, clickUrlFor } from "@/lib/pushPayload";

const JOB_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("push payload validation (service-worker side)", () => {
  it("accepts a well-formed job-assigned payload and caps lengths", () => {
    const p = parsePushPayload(
      JSON.stringify({
        type: "job-assigned",
        jobId: JOB_ID,
        title: "T".repeat(200),
        body: "B".repeat(500),
      }),
    );
    expect(p).not.toBeNull();
    expect(p!.jobId).toBe(JOB_ID);
    expect(p!.title.length).toBe(80);
    expect(p!.body.length).toBe(160);
  });

  it("accepts the pod-submitted type", () => {
    const p = parsePushPayload(
      JSON.stringify({
        type: "pod-submitted",
        jobId: JOB_ID,
        title: "POD ready to review",
        body: "AB12 CDE — inspection submitted.",
      }),
    );
    expect(p?.type).toBe("pod-submitted");
    expect(p?.jobId).toBe(JOB_ID);
  });

  it("rejects unknown types, bad job ids and non-JSON", () => {
    expect(parsePushPayload("not json")).toBeNull();
    expect(
      parsePushPayload(JSON.stringify({ type: "evil", jobId: JOB_ID, title: "t", body: "b" })),
    ).toBeNull();
    expect(
      parsePushPayload(JSON.stringify({ type: "job-assigned", jobId: "../../etc", title: "t", body: "b" })),
    ).toBeNull();
    expect(parsePushPayload(JSON.stringify({ type: "job-assigned" }))).toBeNull();
  });

  it("click destination is always an internal route, never payload-controlled", () => {
    expect(clickUrlFor(JOB_ID)).toBe(`/jobs/${JOB_ID}`);
    expect(clickUrlFor(JOB_ID, "job-assigned")).toBe(`/jobs/${JOB_ID}`);
    // A POD notice opens the report the admin needs to review.
    expect(clickUrlFor(JOB_ID, "pod-submitted")).toBe(`/jobs/${JOB_ID}/pod`);
    expect(clickUrlFor("https://evil.example.com")).toBe("/");
    expect(clickUrlFor("//evil.example.com")).toBe("/");
    expect(clickUrlFor("https://evil.example.com", "pod-submitted")).toBe("/");
    expect(clickUrlFor(undefined)).toBe("/");
  });
});

// ── subscribe flow ──────────────────────────────────────────────────────

const { upsert, del, invoke } = vi.hoisted(() => ({
  upsert: vi.fn().mockResolvedValue({ error: null }),
  del: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  invoke: vi.fn().mockResolvedValue({ data: { sent: 1 }, error: null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ upsert, delete: del }),
    functions: { invoke },
  },
}));

import {
  subscribeToPush,
  notifyJobAssigned,
  notifyPodSubmitted,
  VAPID_PUBLIC_KEY,
} from "@/lib/pushApi";

describe("subscribeToPush", () => {
  const subscribe = vi.fn();
  beforeEach(() => {
    upsert.mockClear();
    subscribe.mockClear();
    Object.defineProperty(window, "PushManager", { value: function () {}, configurable: true });
    Object.defineProperty(window, "Notification", {
      value: { requestPermission: vi.fn().mockResolvedValue("granted"), permission: "default" },
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: subscribe.mockResolvedValue({
              toJSON: () => ({
                endpoint: "https://push.example.com/abc",
                keys: { p256dh: "pk", auth: "ak" },
              }),
            }),
          },
        }),
      },
    });
  });

  it("subscribes with userVisibleOnly and stores the device row for the user", async () => {
    const result = await subscribeToPush("user-1");
    expect(result).toBe("subscribed");
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        endpoint: "https://push.example.com/abc",
        p256dh: "pk",
        auth: "ak",
      }),
      { onConflict: "endpoint" },
    );
  });

  it("returns denied (and stores nothing) when permission is refused", async () => {
    (window.Notification as any).requestPermission = vi.fn().mockResolvedValue("denied");
    const result = await subscribeToPush("user-1");
    expect(result).toBe("denied");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("notifyJobAssigned fires the edge function and never throws", () => {
    invoke.mockRejectedValueOnce(new Error("boom"));
    expect(() => notifyJobAssigned(JOB_ID)).not.toThrow();
    expect(invoke).toHaveBeenCalledWith("send-push", {
      body: { event: "job-assigned", jobId: JOB_ID },
    });
  });

  it("notifyPodSubmitted sends only the jobId and never throws", () => {
    invoke.mockClear();
    invoke.mockRejectedValueOnce(new Error("boom"));
    expect(() => notifyPodSubmitted(JOB_ID)).not.toThrow();
    // The client never supplies recipients or message text — the edge
    // function derives both from trusted job data.
    expect(invoke).toHaveBeenCalledWith("send-push", {
      body: { event: "pod-submitted", jobId: JOB_ID },
    });
  });

  it("exposes a plausible VAPID public key (65-byte uncompressed P-256 point)", () => {
    const pad = "=".repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
    const raw = atob((VAPID_PUBLIC_KEY + pad).replace(/-/g, "+").replace(/_/g, "/"));
    expect(raw.length).toBe(65);
    expect(raw.charCodeAt(0)).toBe(4);
  });
});
