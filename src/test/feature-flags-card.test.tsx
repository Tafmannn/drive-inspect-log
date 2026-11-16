// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rows = vi.hoisted(() => ({ current: [] as { key: string; value: unknown }[] }));
const upsertImpl = vi.hoisted(() => ({ fn: vi.fn() }));
const confirmImpl = vi.hoisted(() => ({ fn: vi.fn() }));
const toastFn = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: rows.current, error: null }) }),
      upsert: (...a: unknown[]) => ({ select: () => upsertImpl.fn(...a) }),
    }),
  },
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmImpl.fn }));
vi.mock("@/hooks/use-toast", () => ({ toast: toastFn }));

import { FeatureFlagsCard } from "@/features/platform/FeatureFlagsCard";
import { flagValueIsOn, setFeatureFlag } from "@/lib/featureFlags";

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <FeatureFlagsCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  rows.current = [
    { key: "MAPS_ENABLED", value: "true" }, // legacy string form
    { key: "VISION_AI_ENABLED", value: true },
    { key: "CLOUD_STORAGE_ENABLED", value: false },
  ]; // EVIDENCE_V2_ENABLED has no row: reads as off
  upsertImpl.fn.mockReset().mockResolvedValue({ data: [{ key: "x" }], error: null });
  confirmImpl.fn.mockReset().mockResolvedValue(true);
  toastFn.mockReset();
});

describe("flagValueIsOn", () => {
  it("accepts true and the legacy string, nothing else", () => {
    expect(flagValueIsOn(true)).toBe(true);
    expect(flagValueIsOn("true")).toBe(true);
    for (const v of [false, "false", null, undefined, 1, "yes", {}]) expect(flagValueIsOn(v)).toBe(false);
  });
});

describe("setFeatureFlag", () => {
  it("rejects an unknown flag without touching the database", async () => {
    await expect(setFeatureFlag("NOPE" as never, true)).rejects.toThrow("Unknown flag");
    expect(upsertImpl.fn).not.toHaveBeenCalled();
  });
  it("treats a write RLS filtered to zero rows as a failure, not a silent success", async () => {
    upsertImpl.fn.mockResolvedValue({ data: [], error: null });
    await expect(setFeatureFlag("MAPS_ENABLED", false)).rejects.toThrow(/permission/i);
  });
  it("surfaces database errors", async () => {
    upsertImpl.fn.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(setFeatureFlag("MAPS_ENABLED", false)).rejects.toThrow("boom");
  });
});

describe("FeatureFlagsCard", () => {
  it("shows each switch from the stored value, with a missing row as off", async () => {
    renderCard();
    const maps = await screen.findByRole("switch", { name: "Maps and distance" });
    expect(maps.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Photo reading (OCR)" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Google Cloud photo storage" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("switch", { name: "Evidence v2 capture" }).getAttribute("aria-checked")).toBe("false");
  });

  it("saves a routine flag straight away as a boolean and says when it takes effect", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("switch", { name: "Maps and distance" }));
    await waitFor(() => expect(upsertImpl.fn).toHaveBeenCalledTimes(1));
    expect(upsertImpl.fn.mock.calls[0][0]).toMatchObject({ key: "MAPS_ENABLED", value: false });
    expect(confirmImpl.fn).not.toHaveBeenCalled();
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    expect(toastFn.mock.calls[0][0].description).toMatch(/5 minutes/);
  });

  it("asks before changing a risky flag, and does nothing if declined", async () => {
    confirmImpl.fn.mockResolvedValue(false);
    renderCard();
    fireEvent.click(await screen.findByRole("switch", { name: "Google Cloud photo storage" }));
    await waitFor(() => expect(confirmImpl.fn).toHaveBeenCalledTimes(1));
    expect(upsertImpl.fn).not.toHaveBeenCalled();
  });

  it("saves a risky flag once confirmed", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("switch", { name: "Evidence v2 capture" }));
    await waitFor(() => expect(upsertImpl.fn).toHaveBeenCalledTimes(1));
    expect(upsertImpl.fn.mock.calls[0][0]).toMatchObject({ key: "EVIDENCE_V2_ENABLED", value: true });
  });

  it("reports a failed save and keeps showing the stored value", async () => {
    upsertImpl.fn.mockResolvedValue({ data: null, error: { message: "denied" } });
    renderCard();
    const sw = await screen.findByRole("switch", { name: "Maps and distance" });
    fireEvent.click(sw);
    await waitFor(() => expect(toastFn).toHaveBeenCalled());
    expect(toastFn.mock.calls[0][0]).toMatchObject({ title: "Couldn't save that setting", variant: "destructive" });
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Maps and distance" }).getAttribute("aria-checked")).toBe("true"),
    );
  });
});
