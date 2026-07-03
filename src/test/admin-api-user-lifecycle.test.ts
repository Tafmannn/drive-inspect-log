import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the edge-function invocations so we can assert Super Admin user/role
// management is routed to the AUTHORITATIVE user-lifecycle function (not the
// legacy promote-admin, which only wrote JWT metadata).
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import {
  listAllUsers,
  createUser,
  setUserRole,
  deactivateUser,
  reactivateUser,
  createOrganisation,
} from "@/lib/adminApi";

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

  it("createUser uses the 'create' action and returns the new user_id", async () => {
    invoke.mockResolvedValue({ data: { success: true, user_id: "new1" }, error: null });
    const id = await createUser("c@x.io", "admin", "o1");
    expect(invoke).toHaveBeenCalledWith("user-lifecycle", {
      body: { _action: "create", email: "c@x.io", role: "admin", org_id: "o1" },
    });
    expect(id).toBe("new1");
  });

  it("setUserRole uses the authoritative set_role action", async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await setUserRole("u9", "super_admin");
    expect(invoke).toHaveBeenCalledWith("user-lifecycle", {
      body: { _action: "set_role", user_id: "u9", role: "super_admin" },
    });
  });

  it("deactivate/reactivate map to suspend/reactivate", async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    await deactivateUser("u1");
    expect(invoke).toHaveBeenLastCalledWith("user-lifecycle", { body: { _action: "suspend", user_id: "u1" } });
    await reactivateUser("u1");
    expect(invoke).toHaveBeenLastCalledWith("user-lifecycle", { body: { _action: "reactivate", user_id: "u1" } });
  });

  it("createOrganisation uses the create_org action", async () => {
    invoke.mockResolvedValue({ data: { success: true, org: { id: "o2", name: "Acme", created_at: "t" } }, error: null });
    const org = await createOrganisation("Acme");
    expect(invoke).toHaveBeenCalledWith("user-lifecycle", { body: { _action: "create_org", name: "Acme" } });
    expect(org).toEqual({ id: "o2", name: "Acme", created_at: "t" });
  });

  it("surfaces edge-function error payloads", async () => {
    invoke.mockResolvedValue({ data: { error: "CANNOT_ESCALATE_BEYOND_OWN_ROLE" }, error: null });
    await expect(setUserRole("u1", "super_admin")).rejects.toThrow(
      "CANNOT_ESCALATE_BEYOND_OWN_ROLE",
    );
  });
});
