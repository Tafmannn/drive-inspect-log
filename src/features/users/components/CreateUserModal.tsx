/**
 * CreateUserModal — invite a new user to the system.
 */
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCreateUser } from "@/hooks/useUserManagement";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserModal({ open, onOpenChange }: CreateUserModalProps) {
  const { isSuperAdmin, user } = useAuth();
  const createMutation = useCreateUser();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("driver");
  const [orgId, setOrgId] = useState("");

  // Load orgs for super admin
  const { data: orgs } = useQuery({
    queryKey: ["organisations"],
    queryFn: async () => {
      const { data } = await supabase.from("organisations").select("id, name").order("name");
      return data ?? [];
    },
    enabled: open && isSuperAdmin,
  });

  // Default org for admin
  const defaultOrgId = user?.id ? "" : "";

  const handleSubmit = () => {
    const targetOrg = isSuperAdmin ? orgId : (user as any)?.org_id;
    if (!email || !targetOrg) return;

    createMutation.mutate(
      { email, role, org_id: targetOrg, first_name: firstName || undefined, last_name: lastName || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setEmail(""); setFirstName(""); setLastName(""); setRole("driver"); setOrgId("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Create New User</DialogTitle>
          <DialogDescription className="text-xs">
            Invite a user via email. They'll receive an activation link.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-[11px]">Email *</Label>
            <Input className="h-8 text-xs mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">First Name</Label>
              <Input className="h-8 text-xs mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px]">Last Name</Label>
              <Input className="h-8 text-xs mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="driver">Driver</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          {isSuperAdmin && (
            <div>
              <Label className="text-[11px]">Organisation *</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue placeholder="Select org" />
                </SelectTrigger>
                <SelectContent>
                  {(orgs ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSubmit} disabled={createMutation.isPending || !email}>
            {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Create & Invite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
