import { useAuth } from "@/context/AuthContext";

export function DevRoleBanner() {
  const { authEnabled, user } = useAuth();
  if (authEnabled) return null;

  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const isSuper = params.get("super") === "1";
  const isAdmin = params.get("admin") === "1";

  if (!isSuper && !isAdmin) return null;

  const label = isSuper ? "SUPERADMIN" : "ADMIN";

  return (
    <div className="bg-warning text-warning-foreground text-center text-xs font-semibold py-1 px-2 z-[9999] sticky top-0">
      ⚠️ DEV ROLE OVERRIDE ACTIVE: {label} — Auth is disabled
    </div>
  );
}
