/**
 * AdminUsers — /admin/users. Shared user management (see UserManagementPanel);
 * the route itself is guarded by AdminRoute (admins and the super admin).
 * Wrapped in the standard page chrome (header + back + bottom bar) — it was
 * rendered bare, a dead end on phones when opened from a link or bookmark.
 */
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { UserManagementPanel } from "@/features/users/components/UserManagementPanel";

export function AdminUsers() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="User Management" showBack onBack={() => navigate("/control/admin")} />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <UserManagementPanel />
      </div>
      <BottomNav />
    </div>
  );
}
