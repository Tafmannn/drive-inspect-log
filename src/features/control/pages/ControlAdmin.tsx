/**
 * Admin page within the Control Centre — /control/admin
 * Provides user management and org settings links.
 */
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { QuickActionsBar } from "../components/shared/QuickActionsBar";
import { useControlAccess } from "../hooks/useControlAccess";
import { Users, Settings, Building2 } from "lucide-react";

export function ControlAdmin() {
  const navigate = useNavigate();
  const { canAccessSuperAdmin } = useControlAccess();

  const actions = [
    { label: "User Management", icon: Users, onClick: () => navigate("/admin/users") },
    { label: "Organisation Settings", icon: Building2, onClick: () => navigate("/admin") },
  ];

  if (canAccessSuperAdmin) {
    actions.push({ label: "Super Admin Panel", icon: Settings, onClick: () => navigate("/super-admin") });
  }

  return (
    <ControlShell>
      <ControlHeader
        title="Administration"
        subtitle="User management, role assignments, and organisation settings"
      />

      <ControlSection title="Quick Access" description="Jump to administration tools">
        <QuickActionsBar actions={actions} />
      </ControlSection>

      <ControlSection title="Note" description="Full admin functionality">
        <p className="text-xs text-muted-foreground">
          Detailed user management, role changes, and organisation settings are available via the
          existing Admin and Super Admin dashboards. Use the quick links above to navigate there.
          These will be migrated into the Control Centre in a future update.
        </p>
      </ControlSection>
    </ControlShell>
  );
}
