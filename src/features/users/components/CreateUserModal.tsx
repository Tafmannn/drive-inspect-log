/**
 * CreateUserModal — invite a new user to the system.
 *
 * Phase 3: enforces the new quick-create requirements.
 *  - Driver: full name + email + mobile + organisation
 *  - Other roles: full name + email + organisation
 * On a Driver create the modal redirects to the Driver Profile Completion page.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserModal({ open, onOpenChange }: CreateUserModalProps) {
  const { isSuperAdmin, user } = useAuth();
  const navigate = useNavigate();
  const createMutation = useCreateUser();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
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

  const reset = () => {
    setEmail(""); setFirstName(""); setLastName(""); setMobile("");
    setRole("driver"); setOrgId("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const targetOrg = isSuperAdmin ? orgId : (user as any)?.org_id;
    const trimmedEmail = email.trim();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedMobile = mobile.trim();
    const fullName = `${trimmedFirst} ${trimmedLast}`.trim();

    if (!fullName) {
      toast({ title: "Full name is required", variant: "destructive" });
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({ title: "A valid email is required", variant: "destructive" });
      return;
    }
    if (!targetOrg) {
      toast({ title: "Organisation is required", variant: "destructive" });
      return;
    }
    if (role === "driver" && !trimmedMobile) {
      toast({ title: "Mobile number is required for drivers", variant: "destructive" });
      return;
    }

    createMutation.mutate(
      {
        email: trimmedEmail,
        role,
        org_id: targetOrg,
        first_name: trimmedFirst || undefined,
        last_name: trimmedLast || undefined,
        phone: trimmedMobile || undefined,
      },
      {
        onSuccess: (newUserId) => {
          onOpenChange(false);
          reset();
          if (role === "driver" && newUserId) {
            navigate(`/admin/drivers/${newUserId}/complete?created=1`);
          }
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

        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">First Name *</Label>
              <Input
                className="h-9 mt-1"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-[11px]">Last Name *</Label>
              <Input
                className="h-9 mt-1"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-[11px]">Email *</Label>
            <Input
              className="h-9 mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-[11px]">
              Mobile {role === "driver" ? "*" : <span className="text-muted-foreground">(optional)</span>}
            </Label>
            <Input
              className="h-9 mt-1"
              type="tel"
              inputMode="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+44..."
            />
          </div>

          <div>
            <Label className="text-[11px]">Role</Label>
            {/* Native select per project UI constraint */}
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="driver">Driver</option>
              <option value="admin">Admin</option>
              {isSuperAdmin && <option value="super_admin">Super Admin</option>}
            </select>
          </div>

          {isSuperAdmin && (
            <div>
              <Label className="text-[11px]">Organisation *</Label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select organisation…</option>
                {(orgs ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-9"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Create & Invite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
