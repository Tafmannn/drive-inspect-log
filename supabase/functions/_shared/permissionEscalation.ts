// Pure, dependency-free permission-override escalation check.
//
// Kept free of Deno/Supabase imports so it can be unit-tested under vitest
// (see src/test/permission-escalation.test.ts) and reused by user-lifecycle.
//
// SECURITY-001b: a non-super-admin must never be able to set an override on
// an is_sensitive permission — that flag is the SAME data-driven signal
// PermissionEditor.tsx uses to hide these entries from non-super-admins in
// the UI entirely, so the server check must key off it alone, not a
// hardcoded subset of permission keys (the previous
// `is_sensitive && [...].includes(key)` check let an admin manage any
// sensitive permission whose key wasn't in that hardcoded list).

/**
 * True when a non-super-admin caller is blocked from managing this
 * permission (i.e. only a super-admin may set/clear an override on it).
 * Super-admin callers should never call this — the caller is expected to
 * short-circuit on `callerIsSuper` before reaching this check.
 */
export function isSensitivePermissionBlockedForNonSuperAdmin(permDef: {
  is_sensitive: boolean;
}): boolean {
  return permDef.is_sensitive === true;
}
