/**
 * The one user-management surface: list → user detail (profile, role,
 * account status, driver profile, permissions, archive/restore) → invite.
 *
 * Used by /control/admin, /admin/users and /super-admin/users so admins and
 * the super admin always get the same controls. Super-admin extras (all-org
 * filter, profile sync, super-admin role, sensitive permissions, protected
 * accounts) are switched on inside the shared components from the caller's
 * role, never by a separate, reduced page.
 */
import { useState, type ReactNode } from "react";
import { UserIndex } from "./UserIndex";
import { UserDetailEditor } from "./UserDetailEditor";
import { CreateUserModal } from "./CreateUserModal";

interface UserManagementPanelProps {
  /** Rendered above the list/detail, receives the "back to list" action when a user is open. */
  renderHeader?: (state: { selectedUserId: string | null; backToList: () => void }) => ReactNode;
  /** Optional frame around the list/detail (e.g. a Control section card). */
  wrap?: (content: ReactNode) => ReactNode;
}

export function UserManagementPanel({ renderHeader, wrap = (c) => c }: UserManagementPanelProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const backToList = () => setSelectedUserId(null);

  return (
    <>
      {renderHeader?.({ selectedUserId, backToList })}
      {wrap(
        selectedUserId ? (
          <UserDetailEditor userId={selectedUserId} onBack={backToList} />
        ) : (
          <UserIndex onSelectUser={setSelectedUserId} onCreateUser={() => setCreateOpen(true)} />
        ),
      )}
      <CreateUserModal open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
