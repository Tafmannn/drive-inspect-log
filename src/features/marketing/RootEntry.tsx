import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ProtectedRoute } from "@/App";
import { Dashboard } from "@/pages/Dashboard";
import { MarketingHome } from "./pages/MarketingHome";

/**
 * Dynamic root (`/`) entry.
 *
 * - Auth disabled (local dev): preserve existing app behaviour (Dashboard).
 * - Auth loading: branded full-screen loader (no dashboard/marketing flash).
 * - Authenticated: the exact existing protected Dashboard — ProtectedRoute keeps
 *   AccountStatusGate, DriverOnboardingGate and suspended/pending handling.
 * - Unauthenticated visitor: the public marketing homepage.
 *
 * The canonical public homepage URL is `/home`; `/` simply serves the right
 * experience for who is asking.
 */
export function RootEntry() {
  const { authEnabled, authLoading, user } = useAuth();

  if (!authEnabled) {
    return (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    );
  }

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-marketing-bg-dark">
        <Loader2 className="h-8 w-8 animate-spin text-marketing-electric" aria-label="Loading" />
      </div>
    );
  }

  if (user) {
    return (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    );
  }

  return <MarketingHome />;
}

export default RootEntry;
