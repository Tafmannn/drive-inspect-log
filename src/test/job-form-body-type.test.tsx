/**
 * Job form body type: suggested from make + model when unset, never
 * overrides a saved value, and an explicit admin choice always wins.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Radix Checkbox measures itself; jsdom has no ResizeObserver.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// A chainable, awaitable stand-in for any supabase query: every builder
// method returns itself; awaiting it yields an empty result.
function emptyQuery(): unknown {
  const result = { data: [], error: null, count: 0 };
  const q: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
      return () => proxy;
    },
  };
  const proxy = new Proxy(q, handler);
  return proxy;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => emptyQuery(),
    rpc: () => Promise.resolve({ data: null, error: null }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  },
}));

vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>("@/context/AuthContext");
  return { ...actual, useAuth: () => ({ isAdmin: true, isSuperAdmin: false, user: { id: "u1", roles: ["ADMIN"] } }) };
});

const createJob = vi.fn();
const mockUseJob = vi.fn();
vi.mock("@/hooks/useJobs", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useJobs")>("@/hooks/useJobs");
  return {
    ...actual,
    useJob: () => mockUseJob(),
    useCreateJob: () => ({ mutateAsync: createJob, isPending: false }),
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

function renderForm(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/jobs/new" element={<JobForm />} />
          <Route path="/jobs/:jobId/edit" element={<JobForm />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}


beforeEach(() => {
  mockUseJob.mockReturnValue({ data: undefined, isLoading: false });
  localStorage.clear();
});

const job = (over: Record<string, unknown>) => ({
  data: { id: "job-1", vehicle_reg: "AB12 CDE", vehicle_make: "BMW", vehicle_model: "X5", client_id: null, job_source: "revilo", vehicle_type: null, ...over },
  isLoading: false,
});
const bodySelect = () => screen.getByLabelText("Body type") as HTMLSelectElement;

describe("JobForm body type", () => {
  it("fills in from make + model when the job has none, and says so", () => {
    mockUseJob.mockReturnValue(job({}));
    renderForm("/jobs/job-1/edit");
    expect(bodySelect().value).toBe("suv");
    expect(screen.getByText(/Suggested from BMW X5/)).toBeInTheDocument();
  });

  it("never replaces a body type already saved on the job", () => {
    mockUseJob.mockReturnValue(job({ vehicle_type: "estate" }));
    renderForm("/jobs/job-1/edit");
    expect(bodySelect().value).toBe("estate");
    expect(screen.queryByText(/Suggested from/)).not.toBeInTheDocument();
  });

  it("leaves multi-shape models unset and explains why", () => {
    mockUseJob.mockReturnValue(job({ vehicle_make: "VOLKSWAGEN", vehicle_model: "Golf" }));
    renderForm("/jobs/job-1/edit");
    expect(bodySelect().value).toBe("");
    expect(screen.getByText(/comes in more than one shape/)).toBeInTheDocument();
  });

  it("an explicit choice (including 'Not set') sticks", () => {
    mockUseJob.mockReturnValue(job({}));
    renderForm("/jobs/job-1/edit");
    fireEvent.change(bodySelect(), { target: { value: "" } });
    expect(bodySelect().value).toBe("");
    fireEvent.change(bodySelect(), { target: { value: "pickup" } });
    expect(bodySelect().value).toBe("pickup");
  });
});
