import { createContext, useContext, useMemo, type ReactNode } from "react";

export type UserRole = "driver" | "admin";

interface AuthContextValue {
  /** Whether full authentication is enabled */
  authEnabled: boolean;
  /** Current user's role */
  role: UserRole;
  /** Current user's display name */
  userName: string;
  /** Whether this user is an admin */
  isAdmin: boolean;
  /** Whether gallery photo picking is allowed (admin only) */
  canUseGallery: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  authEnabled: false,
  role: "driver",
  userName: "Driver",
  isAdmin: false,
  canUseGallery: false,
});

/**
 * Auth provider – currently auth is DISABLED.
 * The default user is a "driver". To test admin features,
 * wrap a subtree with role="admin".
 *
 * When auth is enabled in the future, this will read from
 * Supabase auth session and the user_roles table.
 */
export function AuthProvider({
  children,
  overrideRole,
}: {
  children: ReactNode;
  overrideRole?: UserRole;
}) {
  const role = overrideRole ?? "driver";

  const value = useMemo<AuthContextValue>(
    () => ({
      authEnabled: false,
      role,
      userName: role === "admin" ? "Admin" : "Driver",
      isAdmin: role === "admin",
      canUseGallery: role === "admin",
    }),
    [role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
