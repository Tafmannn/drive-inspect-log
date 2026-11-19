/**
 * New jobs must record where they came from (Movex, Revilo, direct, ...),
 * so the weekly numbers can compare channels. Editing an old job does not
 * force it, and the picker shows the job's existing source.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

const SOURCE_ERROR = /Choose where this job came from/;

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

const submit = () => fireEvent.click(screen.getByRole("button", { name: /Create Job|Update Job/ }));

beforeEach(() => {
  createJob.mockReset();
  mockUseJob.mockReturnValue({ data: undefined, isLoading: false });
  localStorage.clear();
});

describe("JobForm source", () => {
  it("requires a source on a new job", async () => {
    renderForm("/jobs/new");
    expect(screen.getByText("Source *")).toBeInTheDocument();
    submit();
    expect(await screen.findByText(SOURCE_ERROR)).toBeInTheDocument();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("choosing a source satisfies the requirement", async () => {
    renderForm("/jobs/new");
    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: "movex" } });
    submit();
    await waitFor(() => expect(screen.getAllByText(/is required/).length).toBeGreaterThan(0));
    expect(screen.queryByText(SOURCE_ERROR)).not.toBeInTheDocument();
  });

  it("does not require a source when editing, and shows the saved one", async () => {
    mockUseJob.mockReturnValue({
      data: { id: "job-1", vehicle_reg: "AB12 CDE", vehicle_make: "BMW", vehicle_model: "X5", client_id: null, job_source: "revilo" },
      isLoading: false,
    });
    renderForm("/jobs/job-1/edit");
    expect((screen.getByLabelText(/Source/) as HTMLSelectElement).value).toBe("revilo");
    submit();
    await waitFor(() => expect(screen.getAllByText(/is required/).length).toBeGreaterThan(0));
    expect(screen.queryByText(SOURCE_ERROR)).not.toBeInTheDocument();
  });
});
