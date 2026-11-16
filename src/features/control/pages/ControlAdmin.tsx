/**
 * Admin page within the Control Centre — /control/admin
 * Embeds full user management directly in the Control shell.
 */
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { QuickActionsBar } from "../components/shared/QuickActionsBar";
import { useControlAccess } from "../hooks/useControlAccess";
import { UserManagementPanel } from "@/features/users/components/UserManagementPanel";
import { Building2, LayoutDashboard, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ControlAdmin() {
  const navigate = useNavigate();
  const { canAccessSuperAdmin } = useControlAccess();

  // "/admin" is the admin dashboard (queues, onboarding, finance links), not
  // an organisation settings screen, so it is labelled for what it opens.
  const secondaryActions = [
    { label: "Admin dashboard", icon: LayoutDashboard, onClick: () => navigate("/admin"), variant: "outline" as const },
  ];

  if (canAccessSuperAdmin) {
    secondaryActions.push(
      { label: "Organisations", icon: Building2, onClick: () => navigate("/super-admin/orgs"), variant: "outline" as const },
      { label: "Super Admin Panel", icon: Settings, onClick: () => navigate("/super-admin"), variant: "outline" as const },
    );
  }

  return (
    <ControlShell>
      <UserManagementPanel
        renderHeader={({ selectedUserId, backToList }) => (
          <>
            <ControlHeader
              title="Administration"
              subtitle="User management and role assignments"
              actions={
                selectedUserId ? (
                  <Button variant="outline" size="sm" onClick={backToList}>
                    ← Back to list
                  </Button>
                ) : undefined
              }
            />
            <QuickActionsBar actions={secondaryActions} />
          </>
        )}
        wrap={(content) => (
          <ControlSection title="User Management" description="Create, edit, and manage user accounts" flush>
            <div className="p-4">{content}</div>
          </ControlSection>
        )}
      />
    </ControlShell>
  );
}
