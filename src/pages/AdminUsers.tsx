import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { getOrgUsers } from "@/lib/adminApi";
import { UserListTable } from "@/components/Admin/UserListTable";
import { Loader2 } from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
}

export function AdminUsers() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getOrgUsers();
      setUsers(result);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin || isAdmin) fetchUsers();
  }, [isSuperAdmin, isAdmin, fetchUsers]);

  if (!isSuperAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">User Management</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground">No users found.</p>
      ) : (
        <UserListTable users={users} onRefresh={fetchUsers} />
      )}
    </div>
  );
}
