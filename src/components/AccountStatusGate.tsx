import type { AppUser } from "@/context/AuthContext";

/**
 * Blocks functional access for suspended / pending-activation accounts.
 * Returns null (render nothing extra) when the account is active or has no
 * status recorded, so callers can render this unconditionally ahead of their
 * guarded content. Shared by every route guard so a suspended/pending status
 * is enforced consistently everywhere — see WORKFLOW-001 in
 * docs/audits/FULL_UI_WORKFLOW_AUDIT.md for why this was extracted.
 */
export function AccountStatusGate({ user }: { user: AppUser | null }) {
  if (user?.accountStatus === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-lg font-semibold text-destructive">Account Suspended</h1>
          <p className="text-sm text-muted-foreground">Your account has been suspended. Contact your administrator for assistance.</p>
        </div>
      </div>
    );
  }

  if (user?.accountStatus === "pending_activation") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-2 max-w-sm">
          <h1 className="text-lg font-semibold text-foreground">Account Pending</h1>
          <p className="text-sm text-muted-foreground">Your account is pending activation. You'll be notified when access is granted.</p>
        </div>
      </div>
    );
  }

  return null;
}
