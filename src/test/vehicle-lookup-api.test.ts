/**
 * DVLA lookup client: never claims success on failure, maps server error codes
 * to plain-English text that keeps MOT/tax "unverified", and requires a session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: { access_token: "tok" } as { access_token: string } | null,
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: h.session } }) },
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
  },
}));

import { lookupErrorMessage, lookupVehicle } from "@/lib/vehicleLookupApi";

beforeEach(() => {
  h.session = { access_token: "tok" };
  h.invoke.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("lookupVehicle", () => {
  it("refuses without a session and never calls the function", async () => {
    h.session = null;
    expect(await lookupVehicle("AB12 CDE")).toEqual({ success: false, error: "Please sign in again before using DVLA lookup." });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("sends the trimmed registration with the caller's token and returns the server result", async () => {
    const ok = { success: true, registration: "AB12CDE", make: "FORD", motStatus: "Valid", checkedAt: "2026-11-26T10:00:00Z" };
    h.invoke.mockResolvedValue({ data: ok, error: null });
    expect(await lookupVehicle("  AB12 CDE ")).toEqual(ok);
    expect(h.invoke).toHaveBeenCalledWith("vehicle-lookup", {
      body: { registration: "AB12 CDE" },
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("asks the user to sign in again on a 401 from the gateway", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: "Edge Function returned a non-2xx status code: 401" } });
    expect((await lookupVehicle("AB12CDE")).error).toBe("Please sign in again before using DVLA lookup.");
  });

  it("reports any other transport failure generically", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: "500" } });
    expect(await lookupVehicle("AB12CDE")).toEqual({ success: false, error: "DVLA lookup failed. Please try again." });
  });

  it.each([
    ["DVLA_UNAVAILABLE", /not responding.*unverified/],
    ["DVLA_AUTH_FAILED", /authentication failed/],
    ["DVLA_INVALID_RESPONSE", /unreadable.*unverified/],
    ["DVLA_ERROR", /could not check.*unverified/],
    ["BAD_REG", /valid registration/],
    ["INTERNAL", /Please try again/],
  ])("maps server code %s to user-facing text without claiming success", async (code, text) => {
    h.invoke.mockResolvedValue({ data: { success: false, error: code }, error: null });
    const res = await lookupVehicle("AB12CDE");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(text);
    expect(res).not.toHaveProperty("motStatus");
  });

  it("passes through messages it does not know", () => {
    expect(lookupErrorMessage("Vehicle not found")).toBe("Vehicle not found");
  });
});
