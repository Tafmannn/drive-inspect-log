import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * DATA-003: linkJobToClient wrote client_company/client_name/client_email
 * onto the jobs row — the exact fields useInvoicePrepData.ts's eligibility
 * matcher keys off of — without ever checking the update's error. A
 * failure (RLS denial, network blip, transient DB error) resolved
 * successfully from the caller's point of view, so JobForm.tsx's
 * `.catch(() => {})` around the call could never have caught it even if it
 * tried: there was nothing to catch. The job would then be silently
 * invisible to that client's "eligible to invoice" list forever, with the
 * admin having seen a plain "Job created/updated" success toast.
 */
const mockInvoicesUpdate = vi.fn();
const mockJobsUpdate = vi.fn();
const mockClientSingle = vi.fn();

// getClient() is called internally by linkJobToClient() within the same
// module — an ESM internal binding, so mocking clientApi's own export
// wouldn't be observed by that internal call. Instead, mock the
// `clients` table lookup getClient() itself makes.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "invoices") {
        return { update: () => ({ eq: (...a: unknown[]) => mockInvoicesUpdate(...a) }) };
      }
      if (table === "jobs") {
        return { update: () => ({ eq: (...a: unknown[]) => mockJobsUpdate(...a) }) };
      }
      if (table === "clients") {
        return { select: () => ({ eq: () => ({ single: (...a: unknown[]) => mockClientSingle(...a) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

vi.mock("@/lib/orgHelper", () => ({ getOrgId: vi.fn() }));

import { linkJobToClient } from "@/lib/clientApi";

beforeEach(() => {
  mockInvoicesUpdate.mockReset().mockResolvedValue({ error: null });
  mockJobsUpdate.mockReset().mockResolvedValue({ error: null });
  mockClientSingle.mockReset().mockResolvedValue({
    data: { id: "client-1", name: "Acme", company: "Acme Ltd", email: "a@acme.test" },
    error: null,
  });
});

describe("linkJobToClient error propagation (DATA-003)", () => {
  it("does not throw when the invoice update reports PGRST116 (no matching invoice yet)", async () => {
    mockInvoicesUpdate.mockResolvedValue({ error: { code: "PGRST116", message: "no rows" } });
    await expect(linkJobToClient("job-1", "client-1")).resolves.toBeUndefined();
  });

  it("throws when the invoice update reports a real error", async () => {
    mockInvoicesUpdate.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    await expect(linkJobToClient("job-1", "client-1")).rejects.toMatchObject({ code: "42501" });
  });

  it("throws when the jobs table update fails — the authoritative write previously went unchecked", async () => {
    mockJobsUpdate.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    await expect(linkJobToClient("job-1", "client-1")).rejects.toMatchObject({ code: "42501" });
  });

  it("resolves cleanly when both updates succeed", async () => {
    await expect(linkJobToClient("job-1", "client-1")).resolves.toBeUndefined();
    expect(mockJobsUpdate).toHaveBeenCalled();
  });
});
