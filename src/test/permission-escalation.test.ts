import { describe, it, expect } from "vitest";
import { isSensitivePermissionBlockedForNonSuperAdmin } from "../../supabase/functions/_shared/permissionEscalation";

// SECURITY-002: user-lifecycle's set_permission_override previously blocked
// a non-super-admin only for 3 hardcoded permission keys ANDed with
// is_sensitive, instead of is_sensitive alone — the same flag
// PermissionEditor.tsx uses to hide ALL sensitive permissions from
// non-super-admins in the UI. Any other is_sensitive permission was
// manageable by a plain admin via direct API call.
describe("isSensitivePermissionBlockedForNonSuperAdmin", () => {
  it("blocks any permission flagged is_sensitive, regardless of its key", () => {
    expect(isSensitivePermissionBlockedForNonSuperAdmin({ is_sensitive: true })).toBe(true);
  });

  it("does not block a non-sensitive permission", () => {
    expect(isSensitivePermissionBlockedForNonSuperAdmin({ is_sensitive: false })).toBe(false);
  });
});
