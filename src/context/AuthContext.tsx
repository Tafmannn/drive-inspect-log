import { createContext, useContext, useMemo, type ReactNode } from "react";

export type AppRole = "DRIVER" | "ADMIN" | "SUPERADMIN";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  roles: AppRole[];
  status: "active" | "inactive";
}

interface AuthContextValue {
  authEnabled: boolean;
  user: AppUser;
  /** Check if user has a specific role (SUPERADMIN implies all roles) */
  hasRole: (role: AppRole) => boolean;
  /** Whether user has both ADMIN and DRIVER roles */
  isAdminDriver: boolean;
  /** Whether user has ADMIN or SUPERADMIN */
  isAdmin: boolean;
  /** Whether user is SUPERADMIN */
  isSuperAdmin: boolean;
  /** Whether gallery photo picking is allowed (admin/superadmin only) */
  canUseGallery: boolean;
}

const DEFAULT_DRIVER: AppUser = {
  id: "default-driver",
  name: "Driver",
  email: "",
  roles: ["DRIVER"],
  status: "active",
};

const DEFAULT_ADMIN: AppUser = {
  id: "default-admin",
  name: "Admin",
  email: "",
  roles: ["ADMIN"],
  status: "active",
};

export function hasRoleCheck(user: AppUser, role: AppRole): boolean {
  if (user.roles.includes("SUPERADMIN")) return true;
  return user.roles.includes(role);
}

export function isAdminDriverCheck(user: AppUser): boolean {
  return user.roles.includes("ADMIN") && user.roles.includes("DRIVER");
}

const AuthContext = createContext<AuthContextValue>({
  authEnabled: false,
  user: DEFAULT_DRIVER,
  hasRole: () => false,
  isAdminDriver: false,
  isAdmin: false,
  isSuperAdmin: false,
  canUseGallery: false,
});

/**
 * Auth provider – auth is currently DISABLED.
 * Pass overrideRoles to simulate different role combinations.
 */
export function AuthProvider({
  children,
  overrideRoles,
}: {
  children: ReactNode;
  overrideRoles?: AppRole[];
}) {
  const roles = overrideRoles ?? ["DRIVER"];

  const value = useMemo<AuthContextValue>(() => {
    const user: AppUser = {
      id: roles.includes("ADMIN") || roles.includes("SUPERADMIN") ? "default-admin" : "default-driver",
      name: roles.includes("SUPERADMIN") ? "SuperAdmin" : roles.includes("ADMIN") ? "Admin" : "Driver",
      email: "",
      roles,
      status: "active",
    };

    const isAdmin = hasRoleCheck(user, "ADMIN");
    const isSuperAdmin = user.roles.includes("SUPERADMIN");

    return {
      authEnabled: false,
      user,
      hasRole: (role: AppRole) => hasRoleCheck(user, role),
      isAdminDriver: isAdminDriverCheck(user),
      isAdmin,
      isSuperAdmin,
      canUseGallery: isAdmin,
    };
  }, [roles]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

// Re-export legacy type for backwards compatibility
export type UserRole = "driver" | "admin";
