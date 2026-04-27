import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useCreateClient, useUpdateClient } from "@/hooks/useClients";
import type { Client } from "@/lib/clientApi";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Tag } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
}

export function ClientFormModal({ open, onOpenChange, client }: Props) {
  const isEdit = !!client;
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const { isAdmin, isSuperAdmin } = useAuth();
  const canEditRateCard = isAdmin || isSuperAdmin;

  const [form, setForm] = useState({
    name: "",
    company: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
    rate_card_active: false,
    rate_per_mile: "",
    minimum_charge: "",
    agreed_price: "",
    waiting_rate_per_hour: "",
    rate_card_notes: "",
  });

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name,
        company: client.company ?? "",
        email: client.email ?? "",
        phone: client.phone ?? "",
        address: client.address ?? "",
        notes: client.notes ?? "",
        rate_card_active: !!client.rate_card_active,
        rate_per_mile: client.rate_per_mile != null ? String(client.rate_per_mile) : "",
        minimum_charge: client.minimum_charge != null ? String(client.minimum_charge) : "",
        agreed_price: client.agreed_price != null ? String(client.agreed_price) : "",
        waiting_rate_per_hour:
          client.waiting_rate_per_hour != null ? String(client.waiting_rate_per_hour) : "",
        rate_card_notes: client.rate_card_notes ?? "",
      });
    } else {
      setForm({
        name: "", company: "", email: "", phone: "", address: "", notes: "",
        rate_card_active: false, rate_per_mile: "", minimum_charge: "",
        agreed_price: "", waiting_rate_per_hour: "", rate_card_notes: "",
      });
    }
  }, [client, open]);

  const parseNum = (v: string): number | null => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    const basePayload = {
      name: form.name.trim(),
      company: form.company.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      is_active: true,
    };

    // Only admins can write rate card fields. For drivers (or non-admins), the
    // existing rate card values on the row are left untouched.
    const rateCardPayload = canEditRateCard
      ? {
          rate_card_active: form.rate_card_active,
          rate_per_mile: parseNum(form.rate_per_mile),
          minimum_charge: parseNum(form.minimum_charge),
          agreed_price: parseNum(form.agreed_price),
          waiting_rate_per_hour: parseNum(form.waiting_rate_per_hour),
          rate_card_notes: form.rate_card_notes.trim() || null,
        }
      : {};

    const payload = { ...basePayload, ...rateCardPayload };

    try {
      if (isEdit && client) {
        await updateMutation.mutateAsync({ id: client.id, input: payload });
        toast({ title: "Client updated" });
      } else {
        await createMutation.mutateAsync(payload);
        toast({ title: "Client created" });
      }
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Client" : "New Client"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="client-name">Name *</Label>
            <Input
              id="client-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Contact name"
            />
          </div>
          <div>
            <Label htmlFor="client-company">Company</Label>
            <Input
              id="client-company"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              placeholder="Company name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div>
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+44..."
              />
            </div>
          </div>
          <div>
            <Label htmlFor="client-address">Billing Address</Label>
            <Textarea
              id="client-address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Full billing address"
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea
              id="client-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Internal notes..."
              rows={2}
            />
          </div>

          {canEditRateCard && (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-semibold">Rate card (admin)</h4>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="rate-card-active"
                    checked={form.rate_card_active}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, rate_card_active: v }))
                    }
                  />
                  <Label
                    htmlFor="rate-card-active"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Active
                  </Label>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Used by pricing suggestions only — never applied to invoices automatically.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="rc-rpm" className="text-xs">Rate £/mile</Label>
                  <Input
                    id="rc-rpm"
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.rate_per_mile}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, rate_per_mile: e.target.value }))
                    }
                    placeholder="e.g. 1.40"
                  />
                </div>
                <div>
                  <Label htmlFor="rc-min" className="text-xs">Minimum charge £</Label>
                  <Input
                    id="rc-min"
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.minimum_charge}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, minimum_charge: e.target.value }))
                    }
                    placeholder="e.g. 75"
                  />
                </div>
                <div>
                  <Label htmlFor="rc-flat" className="text-xs">Flat agreed price £</Label>
                  <Input
                    id="rc-flat"
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.agreed_price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, agreed_price: e.target.value }))
                    }
                    placeholder="optional"
                  />
                </div>
                <div>
                  <Label htmlFor="rc-wait" className="text-xs">Waiting £/hour</Label>
                  <Input
                    id="rc-wait"
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.waiting_rate_per_hour}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, waiting_rate_per_hour: e.target.value }))
                    }
                    placeholder="e.g. 25"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="rc-notes" className="text-xs">Rate card notes</Label>
                <Textarea
                  id="rc-notes"
                  value={form.rate_card_notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rate_card_notes: e.target.value }))
                  }
                  placeholder="Internal notes about this rate card..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
