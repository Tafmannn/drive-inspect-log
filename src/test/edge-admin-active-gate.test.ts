/**
 * Server-side: only ACTIVE accounts may use admin edge functions.
 *
 * The app's route guards refuse pending and suspended accounts, but most
 * admin edge functions only refused "suspended" — a pending (invited, not
 * activated) admin could call them directly, and send-invoice-email checked
 * no status at all. inactiveAccountError() is the shared rule; the source scan
 * below fails if an admin-gated function stops applying it.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inactiveAccountError } from "../../supabase/functions/_shared/profileAuthz";

describe("inactiveAccountError", () => {
  it("lets only active accounts through", () => {
    expect(inactiveAccountError("active")).toBeNull();
    expect(inactiveAccountError("suspended")).toBe("ACCOUNT_SUSPENDED");
    expect(inactiveAccountError("pending_activation")).toBe("ACCOUNT_NOT_ACTIVE");
    expect(inactiveAccountError("")).toBe("ACCOUNT_NOT_ACTIVE");
    expect(inactiveAccountError("archived")).toBe("ACCOUNT_NOT_ACTIVE");
  });
});

describe("admin edge functions refuse inactive callers", () => {
  const root = join(__dirname, "../../supabase/functions");
  const fns = readdirSync(root).filter((d) => !d.startsWith("_") && existsSync(join(root, d, "index.ts")));

  // A function is admin-gated if it branches on the caller being admin.
  const adminGated = fns.filter((d) => {
    const src = readFileSync(join(root, d, "index.ts"), "utf8");
    return /caller\.isAdmin|callerIsAdmin|ADMIN_OR_SUPER_ADMIN_ONLY/.test(src);
  });

  it("finds the admin-gated functions", () => {
    expect(adminGated).toEqual(
      expect.arrayContaining(["user-lifecycle", "assign-driver", "get-org-users", "portal-access", "send-invoice-email"]),
    );
  });

  it.each(adminGated)("%s applies the active-account rule", (d) => {
    const src = readFileSync(join(root, d, "index.ts"), "utf8");
    const enforced =
      /inactiveAccountError\(/.test(src) ||
      /accountStatus !== "active"/.test(src) ||
      /requireStaff|staffGate/.test(src);
    expect(enforced).toBe(true);
  });
});

describe("user-lifecycle: only a super admin can manage a super admin", () => {
  const src = readFileSync(join(__dirname, "../../supabase/functions/user-lifecycle/index.ts"), "utf8");
  // Each target-managing action (update_profile, set_role, activate, suspend,
  // reactivate) refuses a non-super caller acting on a super_admin target,
  // independent of the is_protected flag.
  it.each(["update_profile", "set_role", "activate", "suspend", "reactivate"])("%s", (action) => {
    const start = src.indexOf(`if (action === "${action}")`);
    expect(start).toBeGreaterThan(-1);
    const next = src.indexOf('if (action === "', start + 10);
    const block = src.slice(start, next === -1 ? undefined : next);
    expect(block).toMatch(/!callerIsSuper && current\.role === "super_admin"/);
  });

  it("set_role still blocks self-modification and escalation beyond the caller", () => {
    expect(src).toMatch(/CANNOT_MODIFY_OWN_ROLE/);
    expect(src).toMatch(/CANNOT_ESCALATE_BEYOND_OWN_ROLE/);
  });
});
