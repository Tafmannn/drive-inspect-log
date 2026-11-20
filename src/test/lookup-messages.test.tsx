// @vitest-environment jsdom
/**
 * What the person creating a job is told when the postcode or company lookup
 * misbehaves, so an outage never reads the same as "no match".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

// Radix measures itself; jsdom has no ResizeObserver.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

function emptyQuery(): unknown {
  const result = { data: [], error: null, count: 0 };
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => emptyQuery(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
  },
}));
vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>("@/context/AuthContext");
  return { ...actual, useAuth: () => ({ isAdmin: true, isSuperAdmin: false, user: { id: "u1", roles: ["ADMIN"] } }) };
});
vi.mock("@/hooks/useJobs", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useJobs")>("@/hooks/useJobs");
  return {
    ...actual,
    useJob: () => ({ data: undefined, isLoading: false }),
    useCreateJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateJob: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
vi.mock("@/hooks/useClients", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useClients")>("@/hooks/useClients");
  return { ...actual, useClients: () => ({ data: [] }) };
});
vi.mock("@/lib/featureFlags", () => ({
  isFeatureEnabled: () => Promise.resolve(false),
  isFeatureEnabledSync: () => false,
  preloadFlags: () => {},
}));

import { JobForm } from "@/pages/JobForm";
import { BusinessSearchInput } from "@/components/BusinessSearchInput";
import {
  lookupPostcode,
  lookupPostcodeDetailed,
  postcodeLookupMessage,
  type PostcodeLookupResult,
} from "@/lib/postcodeApi";
import {
  businessSearchMessage,
  searchBusinesses,
  searchBusinessesDetailed,
} from "@/lib/businessSearchApi";

const area = { id: "postcodes-io:SW1A 2AA", label: "SW1A 2AA, Westminster area (street not available)", line1: "", town: "Westminster", postcode: "SW1A 2AA" };
const street = { id: "g1", label: "10 Example Road, Leeds, LS1 1AA", line1: "10 Example Road", town: "Leeds", postcode: "LS1 1AA" };

beforeEach(() => {
  h.invoke.mockReset();
});
afterEach(() => cleanup());

describe("postcode lookup wording", () => {
  const r = (over: Partial<PostcodeLookupResult>): PostcodeLookupResult => ({ results: [street], degraded: false, failed: false, ...over });

  it("says nothing when it worked", () => {
    expect(postcodeLookupMessage(r({ source: "google" }))).toBe("");
    expect(postcodeLookupMessage(r({ source: "openstreetmap" }))).toBe("");
  });

  it("tells a genuine no-match apart from an outage", () => {
    expect(postcodeLookupMessage(r({ results: [] }))).toMatch(/^No addresses found/);
    expect(postcodeLookupMessage(r({ results: [], degraded: true }))).toMatch(/^Address lookup is unavailable right now/);
    expect(postcodeLookupMessage(r({ results: [], failed: true }))).toMatch(/^Couldn't reach address lookup/);
  });

  it("explains area-only and limited results", () => {
    expect(postcodeLookupMessage(r({ results: [area], source: "postcodes.io", degraded: true }))).toMatch(/only the area for this postcode/);
    expect(postcodeLookupMessage(r({ source: "openstreetmap", degraded: true }))).toMatch(/limited right now/);
  });
});

describe("postcode lookup client", () => {
  it("passes the service's flags through", async () => {
    h.invoke.mockResolvedValue({ data: { results: [area], source: "postcodes.io", degraded: true }, error: null });
    expect(await lookupPostcodeDetailed(" sw1a 2aa ")).toEqual({ results: [area], source: "postcodes.io", degraded: true, failed: false });
    expect(h.invoke).toHaveBeenCalledWith("postcode-lookup", { body: { postcode: "sw1a 2aa" } });
  });

  it("reports a service error or a thrown call as failed, never as 'no match'", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await lookupPostcodeDetailed("LS1 1AA")).toMatchObject({ results: [], failed: true });
    h.invoke.mockRejectedValue(new Error("offline"));
    expect(await lookupPostcodeDetailed("LS1 1AA")).toMatchObject({ results: [], failed: true });
  });

  it("copes with an answer that has no results or flags (an older server)", async () => {
    h.invoke.mockResolvedValue({ data: {}, error: null });
    expect(await lookupPostcodeDetailed("LS1 1AA")).toEqual({ results: [], degraded: false, failed: false, source: undefined });
  });

  it("keeps the simple list-only helper working", async () => {
    h.invoke.mockResolvedValue({ data: { results: [street] }, error: null });
    expect(await lookupPostcode("LS1 1AA")).toEqual([street]);
  });
});

describe("company search client and wording", () => {
  it("passes the flags through, and reports errors as failed", async () => {
    h.invoke.mockResolvedValue({ data: { results: [], degraded: true }, error: null });
    expect(await searchBusinessesDetailed("acme", "LS1 1AA")).toEqual({ results: [], degraded: true, failed: false });
    expect(h.invoke).toHaveBeenCalledWith("business-search", { body: { query: "acme", postcode: "LS1 1AA" } });
    h.invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await searchBusinessesDetailed("acme")).toMatchObject({ failed: true });
    h.invoke.mockRejectedValue(new Error("offline"));
    expect(await searchBusinessesDetailed("acme")).toMatchObject({ failed: true });
  });

  it("keeps the simple list-only helper working", async () => {
    h.invoke.mockResolvedValue({ data: { results: [{ placeId: "p", name: "Acme", address: "x", types: [] }] }, error: null });
    expect(await searchBusinesses("acme")).toHaveLength(1);
  });

  it("words each case", () => {
    expect(businessSearchMessage({ results: [], degraded: false, failed: false })).toBe("");
    expect(businessSearchMessage({ results: [], degraded: true, failed: false })).toMatch(/unavailable right now/);
    expect(businessSearchMessage({ results: [{ placeId: "p", name: "A", address: "B", types: [] }], degraded: true, failed: false })).toMatch(/may be incomplete/);
    expect(businessSearchMessage({ results: [], degraded: false, failed: true })).toMatch(/Couldn't reach company search/);
  });
});

describe("company box on the job form", () => {
  async function typeAndWait(value: string) {
    vi.useFakeTimers();
    render(<BusinessSearchInput name="pickup_company" onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Search business/), { target: { value } });
    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
  }

  it("says so when company search is unavailable", async () => {
    h.invoke.mockResolvedValue({ data: { results: [], degraded: true }, error: null });
    await typeAndWait("acme");
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/unavailable right now/));
  });

  it("says nothing when it works, and clears the note when the box is emptied", async () => {
    h.invoke.mockResolvedValue({ data: { results: [], degraded: true }, error: null });
    await typeAndWait("acme");
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText(/Search business/), { target: { value: "ac" } });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lists results and notes they may be incomplete when Google is limited", async () => {
    h.invoke.mockResolvedValue({
      data: { results: [{ placeId: "n1", name: "Acme Motors", address: "1 High St", types: [] }], degraded: true },
      error: null,
    });
    await typeAndWait("acme");
    await waitFor(() => expect(screen.getByText("Acme Motors")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toMatch(/may be incomplete/);
  });
});

describe("Find Address on the new-job form", () => {
  function renderForm() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/jobs/new"]}>
          <Routes><Route path="/jobs/new" element={<JobForm />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }
  const input = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
  async function findPickupAddress(postcode = "SW1A 2AA") {
    renderForm();
    fireEvent.change(input("pickup_postcode"), { target: { value: postcode } });
    fireEvent.click(screen.getAllByRole("button", { name: /Find Address/ })[0]);
  }

  it("says when Google is down and nothing was found", async () => {
    h.invoke.mockResolvedValue({ data: { results: [], degraded: true }, error: null });
    await findPickupAddress();
    expect(await screen.findByText(/Address lookup is unavailable right now/)).toBeTruthy();
  });

  it("still says 'No addresses found' for a genuine no-match", async () => {
    h.invoke.mockResolvedValue({ data: { results: [], degraded: false }, error: null });
    await findPickupAddress();
    expect(await screen.findByText(/No addresses found/)).toBeTruthy();
  });

  it("says when the lookup can't be reached", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    await findPickupAddress();
    expect(await screen.findByText(/Couldn't reach address lookup/)).toBeTruthy();
  });

  it("shows no note when the lookup worked, and fills the address from a street suggestion", async () => {
    h.invoke.mockResolvedValue({ data: { results: [street], source: "google", degraded: false }, error: null });
    await findPickupAddress("LS1 1AA");
    fireEvent.click(await screen.findByText(street.label));
    expect(input("pickup_address_line1").value).toBe("10");
    expect(input("pickup_address_line2").value).toBe("Example Road");
    expect(input("pickup_city").value).toBe("Leeds");
    expect(input("pickup_postcode").value).toBe("LS1 1AA");
    expect(screen.queryByText(/limited right now|unavailable right now|No addresses found/)).toBeNull();
  });

  it("puts a street with no house number straight into the first address line", async () => {
    const works = { id: "g2", label: "Riverside Works, Leeds, LS1 1AA", line1: "Riverside Works", town: "Leeds", postcode: "LS1 1AA" };
    h.invoke.mockResolvedValue({ data: { results: [works], source: "google", degraded: false }, error: null });
    await findPickupAddress("LS1 1AA");
    fireEvent.click(await screen.findByText(works.label));
    expect(input("pickup_address_line1").value).toBe("Riverside Works");
    expect(input("pickup_address_line2").value).toBe("");
  });

  it("offers an area-only suggestion with a note, and picking it keeps the street already typed", async () => {
    h.invoke.mockResolvedValue({ data: { results: [area], source: "postcodes.io", degraded: true }, error: null });
    renderForm();
    fireEvent.change(input("pickup_address_line1"), { target: { value: "221B Baker Street" } });
    fireEvent.change(input("pickup_postcode"), { target: { value: "SW1A 2AA" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Find Address/ })[0]);

    expect(await screen.findByText(/only the area for this postcode was found/)).toBeTruthy();
    fireEvent.click(screen.getByText(area.label));
    expect(input("pickup_address_line1").value).toBe("221B Baker Street");
    expect(input("pickup_city").value).toBe("Westminster");
    expect(input("pickup_postcode").value).toBe("SW1A 2AA");
  });
});
