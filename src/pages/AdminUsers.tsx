/**
 * AdminUsers — lifecycle-enforced user management page.
 * Replaces the legacy flat user list.
 */
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { UserIndex } from "@/features/users/components/UserIndex";
import { UserDetailEditor } from "@/features/users/components/UserDetailEditor";
import { CreateUserModal } from "@/features/users/components/CreateUserModal";

export function AdminUsers() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (!isSuperAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold mb-4">User Management</h1>

      {selectedUserId ? (
        <UserDetailEditor userId={selectedUserId} onBack={() => setSelectedUserId(null)} />
      ) : (
        <UserIndex
          onSelectUser={(id) => setSelectedUserId(id)}
          onCreateUser={() => setCreateOpen(true)}
        />
      )}

      <CreateUserModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
