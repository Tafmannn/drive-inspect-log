/**
 * AdminUsers — /admin/users. Shared user management (see UserManagementPanel);
 * the route itself is guarded by AdminRoute (admins and the super admin).
 */
import { UserManagementPanel } from "@/features/users/components/UserManagementPanel";

export function AdminUsers() {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="text-lg font-semibold mb-4">User Management</h1>
      <UserManagementPanel />
    </div>
  );
}
