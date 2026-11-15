/**
 * Where clients pay, and whether invoices carry the late-payment sentence.
 * Lives inside the organisation profile's "Invoicing & VAT" card (super admin).
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  hasBankDetails,
  validateBankDetails,
  type BankDetailsInput,
  type BankDetailsRecord,
} from "@/features/invoicing/lib/bankDetails";

export interface OrgPaymentFields extends BankDetailsRecord {
  late_payment_notice: boolean | null;
}

interface Props {
  orgId: string;
  org: Partial<OrgPaymentFields>;
  /** Called with the fields that changed, so the page can update without a reload. */
  onSaved: (changed: Partial<OrgPaymentFields>) => void;
}

const EMPTY: BankDetailsInput = { bankName: "", accountName: "", sortCode: "", accountNumber: "" };

export function OrgPaymentSettings({ orgId, org, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BankDetailsInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof BankDetailsInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [savingLate, setSavingLate] = useState(false);

  const refreshInvoiceSettings = () => queryClient.invalidateQueries({ queryKey: ["invoicing", "org-settings"] });
  const lateOn = org.late_payment_notice !== false;
  const saved = hasBankDetails(org);

  const openEditor = () => {
    setForm({
      bankName: org.bank_name ?? "",
      accountName: org.bank_account_name ?? "",
      sortCode: org.bank_sort_code ?? "",
      accountNumber: org.bank_account_number ?? "",
    });
    setErrors({});
    setOpen(true);
  };

  const save = async () => {
    const result = validateBankDetails(form);
    if (result.ok === false) {
      setErrors(result.errors);
      return;
    }
    const value = result.value;
    setSaving(true);
    try {
      const { error } = await supabase.from("organisations").update(value).eq("id", orgId);
      if (error) throw error;
      onSaved(value);
      void refreshInvoiceSettings();
      setOpen(false);
      toast({
        title: hasBankDetails(value) ? "Bank details saved" : "Bank details cleared",
        description: "New invoices use these. Invoices already issued are not changed.",
      });
    } catch (e) {
      toast({ title: "Could not save the bank details", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setLate = async (next: boolean) => {
    setSavingLate(true);
    try {
      const { error } = await supabase.from("organisations").update({ late_payment_notice: next }).eq("id", orgId);
      if (error) throw error;
      onSaved({ late_payment_notice: next });
      void refreshInvoiceSettings();
    } catch (e) {
      toast({ title: "Could not change the setting", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingLate(false);
    }
  };

  const field = (key: keyof BankDetailsInput, label: string, placeholder: string, inputMode?: "numeric") => (
    <div className="space-y-1.5">
      <Label htmlFor={`bank-${key}`}>{label}</Label>
      <Input
        id={`bank-${key}`}
        value={form[key]}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={80}
        aria-invalid={!!errors[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
      {!!errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>}
    </div>
  );

  return (
    <>
      <div className="space-y-1.5 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Bank details on invoices</p>
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={openEditor}>
            <Pencil className="h-3.5 w-3.5" />
            {saved ? "Edit" : "Add"}
          </Button>
        </div>
        {saved ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Bank</dt>
            <dd className="text-right">{org.bank_name || "—"}</dd>
            <dt className="text-muted-foreground">Account name</dt>
            <dd className="text-right">{org.bank_account_name || "—"}</dd>
            <dt className="text-muted-foreground">Sort code</dt>
            <dd className="text-right font-mono">{org.bank_sort_code}</dd>
            <dt className="text-muted-foreground">Account number</dt>
            <dd className="text-right font-mono">{org.bank_account_number}</dd>
          </dl>
        ) : (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No bank details saved, so invoices show no payment details. Add them so clients know where to pay.
          </p>
        )}
      </div>

      <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <Label htmlFor="org-late-payment" className="text-sm">Late-payment wording</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Adds the statutory late-payment sentence (interest and a fixed fee, Late Payment of Commercial Debts
            (Interest) Act 1998) to invoices. It applies to business clients only, so switch it off if you invoice
            private individuals. Have your accountant confirm the wording.
          </p>
        </div>
        <Switch id="org-late-payment" checked={lateOn} disabled={savingLate} onCheckedChange={(next) => void setLate(next)} />
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bank details on invoices</DialogTitle>
            <DialogDescription>
              Printed on every new invoice. Leave everything blank to remove them. Issued invoices keep the details
              they were sent with.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {field("bankName", "Bank (optional)", "e.g. Monzo")}
            {field("accountName", "Account name", "The name the account is in")}
            {field("sortCode", "Sort code", "12-34-56", "numeric")}
            {field("accountNumber", "Account number", "12345678", "numeric")}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
