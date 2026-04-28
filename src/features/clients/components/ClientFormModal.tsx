import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
import {
  type Client,
  getClientRateCardRow,
  upsertClientRateCard,
} from "@/lib/clientApi";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Tag } from "lucide-react";
import {
  SectionCard,
  SectionHeader,
  StatusPill,
  AdvisoryNote,
} from "@/components/ui-kit";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
}

export function ClientFormModal({ open, onOpenChange, client }: Props) {
  const isEdit = !!client;
  const navigate = useNavigate();
  const createMutation = useCreateClient();
  const updateMutation = useUpdateClient();
  const { isAdmin, isSuperAdmin } = useAuth();
  const canEditRateCard = isAdmin || isSuperAdmin;

  const [form, setForm] = useState({
    name: "",
    company: "",
    billing_email: "",
    client_type: "",
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
    let cancelled = false;
    if (client) {
      setForm((f) => ({
        ...f,
        name: client.name,
        company: client.company ?? "",
        billing_email: (client as any).billing_email ?? "",
        client_type: (client as any).client_type ?? "",
        email: client.email ?? "",
        phone: client.phone ?? "",
        address: client.address ?? "",
        notes: client.notes ?? "",
      }));
      // Load rate card from admin-only table. Drivers will get null via RLS.
      if (canEditRateCard) {
        getClientRateCardRow(client.id)
          .then((rc) => {
            if (cancelled) return;
            setForm((f) => ({
              ...f,
              rate_card_active: !!rc?.rate_card_active,
              rate_per_mile: rc?.rate_per_mile != null ? String(rc.rate_per_mile) : "",
              minimum_charge: rc?.minimum_charge != null ? String(rc.minimum_charge) : "",
              agreed_price: rc?.agreed_price != null ? String(rc.agreed_price) : "",
              waiting_rate_per_hour:
                rc?.waiting_rate_per_hour != null ? String(rc.waiting_rate_per_hour) : "",
              rate_card_notes: rc?.rate_card_notes ?? "",
            }));
          })
          .catch(() => {
            // Ignore — RLS denial or no row.
          });
      }
    } else {
      setForm({
        name: "", company: "", billing_email: "", client_type: "",
        email: "", phone: "", address: "", notes: "",
        rate_card_active: false, rate_per_mile: "", minimum_charge: "",
        agreed_price: "", waiting_rate_per_hour: "", rate_card_notes: "",
      });
    }
    return () => {
      cancelled = true;
    };
  }, [client, open, canEditRateCard]);

  const parseNum = (v: string): number | null => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedCompany = form.company.trim();
    const trimmedBillingEmail = form.billing_email.trim();
    const trimmedClientType = form.client_type.trim();
    const trimmedName = form.name.trim();

    // Quick-create requirements (Phase 3): company + billing email + client type
    if (!isEdit) {
      if (!trimmedCompany) {
        toast({ title: "Company name is required", variant: "destructive" });
        return;
      }
      if (!trimmedBillingEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedBillingEmail)) {
        toast({ title: "A valid billing email is required", variant: "destructive" });
        return;
      }
      if (!trimmedClientType) {
        toast({ title: "Client type is required", variant: "destructive" });
        return;
      }
    } else if (!trimmedName && !trimmedCompany) {
      toast({ title: "Name or company is required", variant: "destructive" });
      return;
    }

    // Default contact name to company name when blank, so legacy contact-name field is satisfied.
    const payload: Record<string, unknown> = {
      name: trimmedName || trimmedCompany,
      company: trimmedCompany || null,
      billing_email: trimmedBillingEmail || null,
      client_type: trimmedClientType || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      is_active: true,
    };

    try {
      let savedClientId: string;
      if (isEdit && client) {
        await updateMutation.mutateAsync({ id: client.id, input: payload as any });
        savedClientId = client.id;
      } else {
        const created = await createMutation.mutateAsync(payload as any);
        savedClientId = (created as any)?.id;
      }

      // Rate card lives in a separate admin-only table. Only attempt write
      // when the actor is admin/super_admin — RLS will reject anyone else.
      if (canEditRateCard && savedClientId) {
        await upsertClientRateCard(savedClientId, {
          rate_card_active: form.rate_card_active,
          rate_per_mile: parseNum(form.rate_per_mile),
          minimum_charge: parseNum(form.minimum_charge),
          agreed_price: parseNum(form.agreed_price),
          waiting_rate_per_hour: parseNum(form.waiting_rate_per_hour),
          rate_card_notes: form.rate_card_notes.trim() || null,
        });
      }

      toast({ title: isEdit ? "Client updated" : "Client created" });
      onOpenChange(false);

      // After fresh creation, route to profile completion.
      if (!isEdit && savedClientId) {
        navigate(`/admin/clients/${savedClientId}/complete?created=1`);
      }
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
            <Label htmlFor="client-company">Company {!isEdit && "*"}</Label>
            <Input
              id="client-company"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              placeholder="Company name"
              autoFocus={!isEdit}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="client-billing-email">Billing email {!isEdit && "*"}</Label>
              <Input
                id="client-billing-email"
                type="email"
                value={form.billing_email}
                onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value }))}
                placeholder="billing@example.com"
              />
            </div>
            <div>
              <Label htmlFor="client-type">Client type {!isEdit && "*"}</Label>
              <select
                id="client-type"
                value={form.client_type}
                onChange={(e) => setForm((f) => ({ ...f, client_type: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                <option value="dealer">Dealer</option>
                <option value="auction">Auction</option>
                <option value="leasing">Leasing</option>
                <option value="trade">Trade</option>
                <option value="private">Private</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="client-name">Primary contact name</Label>
            <Input
              id="client-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Optional — defaults to company"
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
            <SectionCard className="p-3">
              <SectionHeader
                icon={<Tag className="h-4 w-4" />}
                eyebrow="Pricing"
                title="Rate card"
                adminOnly
                right={
                  <>
                    <StatusPill tone={form.rate_card_active ? "success" : "neutral"}>
                      {form.rate_card_active ? "Active" : "Inactive"}
                    </StatusPill>
                    <Switch
                      id="rate-card-active"
                      checked={form.rate_card_active}
                      onCheckedChange={(v) =>
                        setForm((f) => ({ ...f, rate_card_active: v }))
                      }
                    />
                  </>
                }
              />
              <AdvisoryNote>
                Used by pricing suggestions only — never applied to invoices automatically.
              </AdvisoryNote>
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
            </SectionCard>
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
