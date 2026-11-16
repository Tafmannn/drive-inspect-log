import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { kickCustomerNotifications, __resetCustomerNotifyThrottle } from "@/lib/customerNotifyApi";

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset().mockResolvedValue({ data: {}, error: null });
  __resetCustomerNotifyThrottle();
});
afterEach(() => {
  __resetCustomerNotifyThrottle();
  vi.useRealTimers();
});

describe("kickCustomerNotifications", () => {
  it("calls the sender immediately the first time", () => {
    kickCustomerNotifications();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("notify-customers", { body: {} });
  });

  it("coalesces a burst into one trailing call", () => {
    kickCustomerNotifications();
    kickCustomerNotifications();
    kickCustomerNotifications();
    kickCustomerNotifications();
    expect(invoke).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    expect(invoke).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("never throws, even if the call fails", async () => {
    invoke.mockRejectedValue(new Error("offline"));
    expect(() => kickCustomerNotifications()).not.toThrow();
    await Promise.resolve();
  });
});
