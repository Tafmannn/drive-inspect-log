import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDigitalCredential, type DigitalIdCredential } from "./useDigitalCredential";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

const activeCredential: DigitalIdCredential = {
  driver_id: "AX-000099",
  credential_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  org_id: "33333333-3333-4333-8333-333333333333",
  full_name: "Sample Driver",
  employment_type: "contractor",
  role_label: "Authorised Driver",
  photo_path: null,
  credential_version: 1,
  status: "active",
  checked_at: "2026-11-24T10:00:00Z",
  valid_until: "2026-11-24T10:00:30Z",
  company_name: "Axentra Vehicle Logistics",
  company_website: "www.axentravehicles.co.uk",
  company_phone: null,
  issued_by: "Axentra Control",
};

describe("useDigitalCredential server-backed status", () => {
  beforeEach(() => { mocks.rpc.mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("starts loading and displays active only after a valid RPC response", async () => {
    mocks.rpc.mockResolvedValue({ data: activeCredential, error: null });
    const { result } = renderHook(() => useDigitalCredential(activeCredential.user_id));
    await waitFor(() => expect(result.current.status).toBe("active"));
    expect(result.current.credential?.driver_id).toBe("AX-000099");
    expect(result.current.error).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("get_driver_digital_id", {
      p_user_id: activeCredential.user_id,
    });
  });

  it("does not show a credential when no user is logged in", async () => {
    const { result } = renderHook(() => useDigitalCredential(""));
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(result.current.credential).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows missing without a placeholder active ID when the server returns null", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useDigitalCredential(activeCredential.user_id));
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(result.current.credential).toBeNull();
  });

  it("handles server-revoked credentials without active authorisation", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...activeCredential, status: "revoked" }, error: null });
    const { result } = renderHook(() => useDigitalCredential(activeCredential.user_id));
    await waitFor(() => expect(result.current.status).toBe("revoked"));
    expect(result.current.credential?.status).toBe("revoked");
  });

  it("fails closed when the server rejects a suspended account", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "ACCOUNT_INACTIVE" } });
    const { result } = renderHook(() => useDigitalCredential(activeCredential.user_id));
    await waitFor(() => expect(result.current.status).toBe("revoked"));
    expect(result.current.credential).toBeNull();
    expect(result.current.error).toBe("ACCOUNT_INACTIVE");
  });

  it("marks a never-verified credential unavailable on transport failure", async () => {
    mocks.rpc.mockRejectedValue(new Error("Network unavailable"));
    const { result } = renderHook(() => useDigitalCredential(activeCredential.user_id));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.credential).toBeNull();
  });

  it("does not treat expired server windows as valid", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...activeCredential, valid_until: activeCredential.checked_at },
      error: null,
    });
    const { result } = renderHook(() => useDigitalCredential(activeCredential.user_id));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.credential).toBeNull();
  });

  it("downgrades active status when the browser goes offline", async () => {
    mocks.rpc.mockResolvedValue({ data: activeCredential, error: null });
    const { result } = renderHook(() => useDigitalCredential(activeCredential.user_id));
    await waitFor(() => expect(result.current.status).toBe("active"));
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current.status).toBe("grace");
  });

  it("stops presenting an active credential when a later RPC explicitly revokes it", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: activeCredential, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "CREDENTIAL_UNAVAILABLE" } });
    const { result } = renderHook(() => useDigitalCredential(activeCredential.user_id));
    await waitFor(() => expect(result.current.status).toBe("active"));
    await act(async () => { await result.current.refresh(); });
    expect(result.current.status).toBe("revoked");
    expect(result.current.credential).toBeNull();
  });

  it("clears the previous driver ID when switching accounts", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: activeCredential, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const { result, rerender } = renderHook(({ id }) => useDigitalCredential(id), {
      initialProps: { id: activeCredential.user_id },
    });
    await waitFor(() => expect(result.current.status).toBe("active"));
    rerender({ id: "another-driver" });
    await waitFor(() => expect(result.current.status).toBe("missing"));
    expect(result.current.credential).toBeNull();
  });
});
