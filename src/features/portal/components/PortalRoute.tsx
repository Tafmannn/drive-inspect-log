import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { AccountStatusGate } from "@/components/AccountStatusGate";

/**
 * Guard for /portal/*. Only customer-portal logins (CLIENT role) get in;
 * staff are sent back to their own app. The real boundary is server-side —
 * every portal_* function independently re-checks the caller — this guard
 * just keeps each kind of user in the UI that's meant for them.
 */
export function PortalRoute({ children }: { children: React.ReactNode }) {
  const { authEnabled, authLoading, user } = useAuth();

  if (!authEnabled) return <Navigate to="/" replace />;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.accountStatus === "suspended" || user.accountStatus === "pending_activation") {
    return <AccountStatusGate user={user} />;
  }

  if (!user.roles.includes("CLIENT")) return <Navigate to="/" replace />;

  return <>{children}</>;
}
