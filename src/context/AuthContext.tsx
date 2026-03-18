import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupaUser, Session } from "@supabase/supabase-js";

/* ── Feature toggle ──────────────────────────────────────────────────
 * VITE_ENABLE_AUTH=false is ONLY honoured in development mode.
 * In production, auth is always required regardless of env var value.
 * This prevents accidental deployment with auth disabled.
 */

const AUTH_ENABLED =
  typeof import.meta !== "undefined" &&
  (import.meta.env.DEV
    ? (import.meta.env.VITE_ENABLE_AUTH as string | undefined) !== "false"
    : true);

/* ── Public types ──────────────────────────────────────────────────── */

export type AppRole = "DRIVER" | "ADMIN" | "SUPERADMIN";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  roles: AppRole[];
  status: "active" | "inactive";
  /** App-level account status from user_profiles */
  accountStatus?: "pending_activation" | "active" | "suspended";
}

interface AuthContextValue {
  authEnabled: boolean;
  /** Whether the initial session check has completed */
  authLoading: boolean;
  /** null when logged out (only meaningful when authEnabled) */
  user: AppUser | null;
  hasRole: (role: AppRole) => boolean;
  isAdminDriver: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canUseGallery: boolean;
  logout: () => Promise<void>;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

export function hasRoleCheck(user: AppUser, role: AppRole): boolean {
  if (user.roles.includes("SUPERADMIN")) return true;
  return user.roles.includes(role);
}

export function isAdminDriverCheck(user: AppUser): boolean {
  return user.roles.includes("ADMIN") && user.roles.includes("DRIVER");
}

function deriveAppUser(supaUser: SupaUser): AppUser {
  const email = (supaUser.email ?? "").toLowerCase();
  const roles: AppRole[] = ["DRIVER"];

  // Merge any metadata roles
  const metaRoles = [
    ...((supaUser.user_metadata?.roles ?? []) as string[]),
    ...((supaUser.app_metadata?.roles ?? []) as string[]),
    typeof supaUser.user_metadata?.role === "string" ? supaUser.user_metadata.role : "",
    typeof supaUser.app_metadata?.role === "string" ? supaUser.app_metadata.role : "",
  ].filter(Boolean);

  for (const r of metaRoles) {
    const normalized = String(r).toUpperCase().replace(/-/g, "_");
    const mapped = (normalized === "SUPER_ADMIN" ? "SUPERADMIN" : normalized) as AppRole;
    if (["DRIVER", "ADMIN", "SUPERADMIN"].includes(mapped) && !roles.includes(mapped)) {
      roles.push(mapped);
    }
  }

  return {
    id: supaUser.id,
    name:
      supaUser.user_metadata?.full_name ??
      supaUser.user_metadata?.name ??
      email.split("@")[0] ??
      "User",
    email,
    roles,
    status: "active",
  };
}

function buildDevUser(roles: AppRole[]): AppUser {
  return {
    id:
      roles.includes("ADMIN") || roles.includes("SUPERADMIN")
        ? "default-admin"
        : "default-driver",
    name: roles.includes("SUPERADMIN")
      ? "SuperAdmin"
      : roles.includes("ADMIN")
        ? "Admin"
        : "Driver",
    email: "",
    roles,
    status: "active",
  };
}

function buildContextValue(
  user: AppUser | null,
  loading: boolean,
  logoutFn: () => Promise<void>,
): AuthContextValue {
  const safeUser = user;
  const isAdmin = safeUser ? hasRoleCheck(safeUser, "ADMIN") : false;
  const isSuperAdmin = safeUser?.roles.includes("SUPERADMIN") ?? false;

  return {
    authEnabled: AUTH_ENABLED,
    authLoading: loading,
    user: safeUser,
    hasRole: (role) => (safeUser ? hasRoleCheck(safeUser, role) : false),
    isAdminDriver: safeUser ? isAdminDriverCheck(safeUser) : false,
    isAdmin,
    isSuperAdmin,
    canUseGallery: isAdmin,
    logout: logoutFn,
  };
}

/* ── Context ───────────────────────────────────────────────────────── */

const AuthContext = createContext<AuthContextValue>({
  authEnabled: false,
  authLoading: true,
  user: null,
  hasRole: () => false,
  isAdminDriver: false,
  isAdmin: false,
  isSuperAdmin: false,
  canUseGallery: false,
  logout: async () => {},
});

/* ── Provider ──────────────────────────────────────────────────────── */

export function AuthProvider({
  children,
  overrideRoles,
}: {
  children: ReactNode;
  overrideRoles?: AppRole[];
}) {
  /* ─ DEV / AUTH_ENABLED=false path ─ */
  if (!AUTH_ENABLED) {
    const roles = overrideRoles ?? ["DRIVER"];
    const devUser = buildDevUser(roles);
    const value = buildContextValue(devUser, false, async () => {});
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  /* ─ REAL AUTH path ─ */
  return <RealAuthProvider>{children}</RealAuthProvider>;
}

function RealAuthProvider({ children }: { children: ReactNode }) {
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const handleSession = useCallback(async (session: Session | null) => {
    if (session?.user) {
      const user = deriveAppUser(session.user);
      // Fetch account_status + role from user_profiles (DB is authoritative)
      try {
        const { data } = await (supabase as any)
          .from("user_profiles")
          .select("account_status, role")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        if (data?.account_status) {
          user.accountStatus = data.account_status as AppUser["accountStatus"];
        }
        if (data?.role) {
          const dbRole = data.role === "super_admin" ? "SUPERADMIN" : data.role.toUpperCase();
          if (
            ["DRIVER", "ADMIN", "SUPERADMIN"].includes(dbRole) &&
            !user.roles.includes(dbRole as AppRole)
          ) {
            user.roles.push(dbRole as AppRole);
          }
        }
      } catch {
        // If fetch fails, allow through (fail-open for now)
      }
      setAppUser(user);
    } else {
      setAppUser(null);
    }
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session).then(() => setLoading(false));
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session).then(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, [handleSession]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setAppUser(null);
  }, []);

  const value = useMemo(
    () => buildContextValue(appUser, loading, logout),
    [appUser, loading, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ── Hook ──────────────────────────────────────────────────────────── */

export function useAuth() {
  return useContext(AuthContext);
}

// Legacy compat
export type UserRole = "driver" | "admin";
