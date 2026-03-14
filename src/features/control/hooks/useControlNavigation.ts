import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { CONTROL_NAV } from "../config/navigation";
import type { NavGroup } from "../types";

/**
 * Returns the navigation groups filtered by the current user's roles.
 */
export function useControlNavigation(): NavGroup[] {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user) return [];

    return CONTROL_NAV.filter((group) => {
      if (!group.requiredRoles || group.requiredRoles.length === 0) return true;
      return group.requiredRoles.some((r) => user.roles.includes(r));
    }).map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.requiredRoles || item.requiredRoles.length === 0) return true;
        return item.requiredRoles.some((r) => user.roles.includes(r));
      }),
    }));
  }, [user]);
}
