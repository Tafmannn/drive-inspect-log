import { useAuth } from "@/context/AuthContext";
import { isE2ETestMode } from "@/lib/logger";

export function DevRoleBanner() {
  const { authEnabled } = useAuth();

  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const isSuper = params.get("super") === "1";
  const isAdmin = params.get("admin") === "1";
  const isE2E = isE2ETestMode();

  const showDevOverride = !authEnabled && (isSuper || isAdmin);
  const showE2E = isE2E;

  if (!showDevOverride && !showE2E) return null;

  return (
    <div className="bg-warning text-warning-foreground text-center text-xs font-semibold py-1 px-2 z-[9999] sticky top-0 space-x-3">
      {showDevOverride && (
        <span>⚠️ DEV ROLE OVERRIDE: {isSuper ? "SUPERADMIN" : "ADMIN"}</span>
      )}
      {showE2E && (
        <span>🧪 E2E TEST MODE</span>
      )}
    </div>
  );
}
