/**
 * New jobs must name their client (what puts them in the client's portal and
 * invoice list) unless explicitly marked as a one-off. Existing jobs without
 * a client can still be edited.
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

const CLIENT_ERROR = /Choose the client for this job/;

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

describe("JobForm client requirement", () => {
  it("asks for a client on a new job and offers the one-off option", async () => {
    renderForm("/jobs/new");
    expect(screen.getByText("Client *")).toBeInTheDocument();
    submit();
    expect(await screen.findByText(CLIENT_ERROR)).toBeInTheDocument();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("ticking 'One-off job' clears the client error", async () => {
    renderForm("/jobs/new");
    submit();
    await screen.findByText(CLIENT_ERROR);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.queryByText(CLIENT_ERROR)).not.toBeInTheDocument());
    submit();
    // Other required fields are still empty, but the client one is satisfied.
    await waitFor(() => expect(screen.getAllByText(/is required/).length).toBeGreaterThan(0));
    expect(screen.queryByText(CLIENT_ERROR)).not.toBeInTheDocument();
  });

  it("does not require a client when editing an existing job", async () => {
    mockUseJob.mockReturnValue({
      data: { id: "job-1", vehicle_reg: "AB12 CDE", vehicle_make: "BMW", vehicle_model: "X5", client_id: null },
      isLoading: false,
    });
    renderForm("/jobs/job-1/edit");
    expect(screen.queryByText("Client *")).not.toBeInTheDocument();
    expect(screen.getByText(/Not linked to a client/)).toBeInTheDocument();
    submit();
    await waitFor(() => expect(screen.getAllByText(/is required/).length).toBeGreaterThan(0));
    expect(screen.queryByText(CLIENT_ERROR)).not.toBeInTheDocument();
  });
});
