import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PromoteAdminButton } from "@/components/Admin/PromoteAdminButton";
import { AssignDriverButton } from "@/components/Admin/AssignDriverButton";
import { useAuth } from "@/context/AuthContext";

interface UserRow {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
}

interface UserListTableProps {
  users: UserRow[];
  onRefresh: () => void;
}

export function UserListTable({ users, onRefresh }: UserListTableProps) {
  const { isSuperAdmin } = useAuth();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Org ID</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((u) => (
          <TableRow key={u.id}>
            <TableCell>{u.email}</TableCell>
            <TableCell>{u.role || "driver"}</TableCell>
            <TableCell className="font-mono text-xs">
              {u.org_id || "—"}
            </TableCell>
            <TableCell className="space-x-2">
              {isSuperAdmin && (
                <PromoteAdminButton
                  email={u.email}
                  orgId={u.org_id ?? undefined}
                  currentRole={u.role}
                  onPromoted={onRefresh}
                />
              )}
              <AssignDriverButton
                email={u.email}
                orgId={u.org_id ?? undefined}
                currentRole={u.role}
                onAssigned={onRefresh}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
