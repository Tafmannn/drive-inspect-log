import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDigitalIdPhotoUrl } from "./useDigitalIdPhotoUrl";

const mocks = vi.hoisted(() => ({ signed: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: mocks.signed }) } },
}));

describe("private Digital ID photograph URL", () => {
  beforeEach(() => { mocks.signed.mockReset(); });

  it("does not request a signed URL without a storage path", () => {
    const { result } = renderHook(() => useDigitalIdPhotoUrl(null));
    expect(result.current).toBeNull();
    expect(mocks.signed).not.toHaveBeenCalled();
  });

  it("returns a short-lived signed URL rather than a public storage URL", async () => {
    mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.test/signed" }, error: null });
    const { result } = renderHook(() => useDigitalIdPhotoUrl("org/driver/portrait.jpg"));
    await waitFor(() => expect(result.current).toBe("https://example.test/signed"));
    expect(mocks.signed).toHaveBeenCalledWith("org/driver/portrait.jpg", 90);
  });

  it("fails closed if signing fails", async () => {
    mocks.signed.mockResolvedValue({ data: null, error: { message: "Unauthorized" } });
    const { result } = renderHook(() => useDigitalIdPhotoUrl("org/driver/revoked.jpg"));
    await waitFor(() => expect(mocks.signed).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });

  it("clears a prior signed URL when the photograph is removed", async () => {
    mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.test/signed" }, error: null });
    const { result, rerender } = renderHook(({ path }) => useDigitalIdPhotoUrl(path), {
      initialProps: { path: "org/driver/portrait.jpg" as string | null },
    });
    await waitFor(() => expect(result.current).toBe("https://example.test/signed"));
    rerender({ path: null });
    await waitFor(() => expect(result.current).toBeNull());
  });
  it("never displays a previous driver's signed photo when the path changes", async () => {
    mocks.signed.mockImplementation((path: string) => {
      if (path === "org/driver-a.jpg") {
        return Promise.resolve({ data: { signedUrl: "https://example.test/driver-a" }, error: null });
      }
      return new Promise(() => {});
    });
    const { result, rerender } = renderHook(({ path }) => useDigitalIdPhotoUrl(path), {
      initialProps: { path: "org/driver-a.jpg" },
    });
    await waitFor(() => expect(result.current).toBe("https://example.test/driver-a"));
    rerender({ path: "org/driver-b.jpg" });
    expect(result.current).toBeNull();
    expect(mocks.signed).toHaveBeenCalledWith("org/driver-b.jpg", 90);
  });

  it("fails closed if signing throws a network exception", async () => {
    mocks.signed.mockRejectedValue(new Error("Network failure"));
    const { result } = renderHook(() => useDigitalIdPhotoUrl("org/driver/photo.jpg"));
    await waitFor(() => expect(mocks.signed).toHaveBeenCalledTimes(1));
    expect(result.current).toBeNull();
  });
});
