import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the edge-function invocations so we can assert Super Admin user/role
// management is routed to the AUTHORITATIVE user-lifecycle function (not the
// legacy promote-admin, which only wrote JWT metadata).
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { listAllUsers, createOrganisation } from "@/lib/adminApi";

beforeEach(() => invoke.mockReset());

describe("adminApi Super Admin actions → user-lifecycle", () => {
  it("listAllUsers targets user-lifecycle and maps profile rows to OrgUser", async () => {
    invoke.mockResolvedValue({
      data: {
        users: [
          { auth_user_id: "u1", email: "a@x.io", role: "admin", org_id: "o1", account_status: "active" },
          { auth_user_id: "u2", email: "b@x.io", role: "driver", org_id: "o1", account_status: "suspended" },
        ],
      },
      error: null,
    });
    const out = await listAllUsers();
    expect(invoke).toHaveBeenCalledWith("user-lifecycle", { body: { _action: "list" } });
    expect(out).toEqual([
      { id: "u1", email: "a@x.io", role: "admin", org_id: "o1", is_active: true },
      { id: "u2", email: "b@x.io", role: "driver", org_id: "o1", is_active: false },
    ]);
  });

  it("createOrganisation uses the create_org action", async () => {
    invoke.mockResolvedValue({ data: { success: true, org: { id: "o2", name: "Acme", created_at: "t" } }, error: null });
    const org = await createOrganisation("Acme");
    expect(invoke).toHaveBeenCalledWith("user-lifecycle", { body: { _action: "create_org", name: "Acme" } });
    expect(org).toEqual({ id: "o2", name: "Acme", created_at: "t" });
  });

  it("surfaces edge-function error payloads", async () => {
    invoke.mockResolvedValue({ data: { error: "SUPER_ADMIN_ONLY" }, error: null });
    await expect(createOrganisation("Acme")).rejects.toThrow("SUPER_ADMIN_ONLY");
  });
});
