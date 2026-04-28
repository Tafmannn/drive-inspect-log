/**
 * OrganisationFormModal — quick-create modal for super admins.
 * Required: organisation name + main contact email.
 * On success, redirects to the Organisation Profile Completion page.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrganisationFormModal({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; contactEmail: string; contactName?: string }) => {
      const payload: Record<string, unknown> = {
        name: input.name,
        main_contact_email: input.contactEmail,
        status: "active",
      };
      if (input.contactName) payload.main_contact_name = input.contactName;

      const { data, error } = await supabase
        .from("organisations")
        .insert(payload as any)
        .select("id")
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: ["organisations"] });
      toast({ title: "Organisation created" });
      onOpenChange(false);
      setName(""); setContactEmail(""); setContactName("");
      navigate(`/super-admin/orgs/${org.id}/complete?created=1`);
    },
    onError: (err: Error) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = contactEmail.trim();
    if (!trimmedName) {
      toast({ title: "Organisation name is required", variant: "destructive" });
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({ title: "A valid main contact email is required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: trimmedName,
      contactEmail: trimmedEmail,
      contactName: contactName.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Organisation</DialogTitle>
          <DialogDescription className="text-xs">
            Quick create — you'll complete the full profile next.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="org-name">Organisation name *</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Axentra Logistics Ltd"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="org-contact-email">Main contact email *</Label>
            <Input
              id="org-contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="ops@example.com"
            />
          </div>
          <div>
            <Label htmlFor="org-contact-name">Main contact name</Label>
            <Input
              id="org-contact-name"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create & Continue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
