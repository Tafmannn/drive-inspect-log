import { Navigate } from "react-router-dom";
import { useAuth, type AppRole } from "@/context/AuthContext";
import { AccountStatusGate } from "@/components/AccountStatusGate";
import { Loader2 } from "lucide-react";

/**
 * Guard for /control/* routes.
 * Requires ADMIN or SUPERADMIN by default.
 * Pass `requiredRole` for stricter checks (e.g. SUPERADMIN-only).
 */
export function ControlRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: AppRole;
}) {
  const { authEnabled, authLoading, user, isAdmin, isSuperAdmin } = useAuth();

  if (!authEnabled) return <>{children}</>;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Block suspended or pending_activation users — this guard is the sole
  // gate for /control/* (it is not nested inside ProtectedRoute), so it must
  // enforce the same account-status check or a suspended admin retains full
  // Command Center access (dispatch, POD review, finance, driver management,
  // and the super-admin panel) despite being locked out everywhere else.
  if (user.accountStatus === "suspended" || user.accountStatus === "pending_activation") {
    return <AccountStatusGate user={user} />;
  }

  // Check specific role requirement
  if (requiredRole === "SUPERADMIN" && !isSuperAdmin) {
    return <Navigate to="/control" replace />;
  }

  // Default: must be admin or superadmin
  if (!isAdmin && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
