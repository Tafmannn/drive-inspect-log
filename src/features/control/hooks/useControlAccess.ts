import { useAuth } from "@/context/AuthContext";

/** Derived access flags for the Control Center */
export function useControlAccess() {
  const { user, isAdmin, isSuperAdmin } = useAuth();

  return {
    canAccessControl: isAdmin || isSuperAdmin,
    canAccessSuperAdmin: isSuperAdmin,
    userName: user?.name ?? "User",
    userEmail: user?.email ?? "",
    userId: user?.id ?? "",
  };
}
