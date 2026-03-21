/**
 * Admin page within the Control Centre — /control/admin
 * Embeds full user management directly in the Control shell.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { QuickActionsBar } from "../components/shared/QuickActionsBar";
import { useControlAccess } from "../hooks/useControlAccess";
import { UserIndex } from "@/features/users/components/UserIndex";
import { UserDetailEditor } from "@/features/users/components/UserDetailEditor";
import { CreateUserModal } from "@/features/users/components/CreateUserModal";
import { Building2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ControlAdmin() {
  const navigate = useNavigate();
  const { canAccessSuperAdmin } = useControlAccess();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const secondaryActions = [
    { label: "Organisation Settings", icon: Building2, onClick: () => navigate("/admin"), variant: "outline" as const },
  ];

  if (canAccessSuperAdmin) {
    secondaryActions.push({
      label: "Super Admin Panel",
      icon: Settings,
      onClick: () => navigate("/super-admin"),
      variant: "outline" as const,
    });
  }

  return (
    <ControlShell>
      <ControlHeader
        title="Administration"
        subtitle="User management, role assignments, and organisation settings"
        actions={
          selectedUserId ? (
            <Button variant="outline" size="sm" onClick={() => setSelectedUserId(null)}>
              ← Back to list
            </Button>
          ) : undefined
        }
      />

      {/* Secondary quick links */}
      <QuickActionsBar actions={secondaryActions} />

      {/* Embedded user management */}
      <ControlSection title="User Management" description="Create, edit, and manage user accounts" flush>
        <div className="p-4">
          {selectedUserId ? (
            <UserDetailEditor userId={selectedUserId} onBack={() => setSelectedUserId(null)} />
          ) : (
            <UserIndex
              onSelectUser={(id) => setSelectedUserId(id)}
              onCreateUser={() => setCreateOpen(true)}
            />
          )}
        </div>
      </ControlSection>

      <CreateUserModal open={createOpen} onOpenChange={setCreateOpen} />
    </ControlShell>
  );
}
