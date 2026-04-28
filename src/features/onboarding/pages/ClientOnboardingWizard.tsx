/**
 * ClientOnboardingWizard — 3-step client completion wizard.
 *
 * Steps: Business · Billing · Operations + Documents
 *
 * Reads/writes the clients row keyed by id; documents are saved
 * via DocumentsUploader against clients.id.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { WizardShell, WizardStepDef } from "../components/WizardShell";
import { DocumentsUploader, DocumentSlot } from "../components/DocumentsUploader";

const STEPS: WizardStepDef[] = [
  { id: 1, title: "Business", desc: "Legal name, contacts and trading info" },
  { id: 2, title: "Billing", desc: "Rates, payment terms and credit" },
  { id: 3, title: "Operations & Documents", desc: "Handover requirements and contracts" },
];

const DOC_SLOTS: DocumentSlot[] = [
  { documentType: "signed_terms", label: "Signed terms of business", required: true },
  { documentType: "rate_card", label: "Agreed rate card" },
  { documentType: "insurance_cert", label: "Insurance certificate", needsExpiry: true },
];

type ClientRow = {
  id: string;
  org_id: string;
  name: string;
  company: string | null;
  trading_name: string | null;
  client_type: string | null;
  vat_number: string | null;
  company_number: string | null;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_mobile: string | null;
  main_phone: string | null;
  email: string | null;
  billing_email: string | null;
  billing_address: string | null;
  address: string | null;
  payment_terms: string | null;
  rate_type: string | null;
  rate_value: number | null;
  minimum_charge: number | null;
  credit_limit: number | null;
  signature_required: boolean;
  handover_requirements: string | null;
  opening_hours: string | null;
  notes: string | null;
};

const EMPTY: Omit<ClientRow, "id" | "org_id"> = {
  name: "", company: "", trading_name: "", client_type: "",
  vat_number: "", company_number: "", website: "",
  contact_name: "", contact_email: "", contact_mobile: "",
  main_phone: "", email: "", billing_email: "", billing_address: "",
  address: "", payment_terms: "Net 30", rate_type: "per_mile",
  rate_value: null, minimum_charge: null, credit_limit: null,
  signature_required: false, handover_requirements: "",
  opening_hours: "", notes: "",
};

export default function ClientOnboardingWizard() {
  const navigate = useNavigate();
  const { clientId = "" } = useParams<{ clientId: string }>();
  const [params] = useSearchParams();
  const justCreated = params.get("created") === "1";

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [data, setData] = useState<typeof EMPTY>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: c, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      if (c) {
        setOrgId(c.org_id ?? "");
        setData({
          name: c.name ?? "",
          company: c.company ?? "",
          trading_name: c.trading_name ?? "",
          client_type: c.client_type ?? "",
          vat_number: c.vat_number ?? "",
          company_number: c.company_number ?? "",
          website: c.website ?? "",
          contact_name: c.contact_name ?? "",
          contact_email: c.contact_email ?? "",
          contact_mobile: c.contact_mobile ?? "",
          main_phone: c.main_phone ?? "",
          email: c.email ?? "",
          billing_email: c.billing_email ?? "",
          billing_address: c.billing_address ?? "",
          address: c.address ?? "",
          payment_terms: c.payment_terms ?? "Net 30",
          rate_type: c.rate_type ?? "per_mile",
          rate_value: c.rate_value ?? null,
          minimum_charge: c.minimum_charge ?? null,
          credit_limit: c.credit_limit ?? null,
          signature_required: c.signature_required ?? false,
          handover_requirements: c.handover_requirements ?? "",
          opening_hours: c.opening_hours ?? "",
          notes: c.notes ?? "",
        });
      }
    } catch (e) {
      toast({ title: "Failed to load client", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const set = useCallback(<K extends keyof typeof EMPTY>(k: K, v: typeof EMPTY[K]) => {
    setData(prev => ({ ...prev, [k]: v }));
  }, []);

  const persist = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update(data as never)
        .eq("id", clientId);
      if (error) throw error;
      return true;
    } catch (e) {
      toast({ title: "Save failed", description: String((e as Error).message ?? e), variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [data, clientId]);

  const validate = (s: number): string | null => {
    if (s === 1) {
      if (!data.name.trim() && !data.company?.trim()) return "Company name is required.";
      if (!data.billing_email?.trim()) return "Billing email is required.";
    }
    if (s === 2) {
      if (!data.payment_terms?.trim()) return "Payment terms are required.";
    }
    return null;
  };

  const onNext = async () => {
    const err = validate(step);
    if (err) {
      toast({ title: "Please complete this step", description: err, variant: "destructive" });
      return;
    }
    const ok = await persist();
    if (!ok) return;
    if (step < STEPS.length) {
      setStep(step + 1);
    } else {
      toast({ title: "Client onboarding saved" });
      navigate("/admin/clients");
    }
  };

  const onBack = () => step > 1 && setStep(step - 1);

  const banner = useMemo(() => justCreated ? (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs">
          <span className="font-semibold">Client created.</span>{" "}
          Complete the steps below to make this client invoice-ready.
        </p>
      </CardContent>
    </Card>
  ) : null, [justCreated]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <WizardShell
      title="Complete Client Profile"
      steps={STEPS}
      current={step}
      onBack={onBack}
      onNext={onNext}
      saving={saving}
      isFirst={step === 1}
      isLast={step === STEPS.length}
      exitTo="/admin/clients"
      banner={banner}
    >
      {step === 1 && (
        <>
          <Field label="Company Name *" value={data.company ?? data.name} onChange={v => { set("company", v); set("name", v); }} />
          <Field label="Trading Name" value={data.trading_name ?? ""} onChange={v => set("trading_name", v)} />
          <div>
            <Label className="text-xs text-muted-foreground">Client type</Label>
            <select
              value={data.client_type ?? ""}
              onChange={e => set("client_type", e.target.value)}
              className="mt-1 w-full min-h-[40px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select…</option>
              <option value="dealer">Dealer</option>
              <option value="auction">Auction</option>
              <option value="leasing">Leasing</option>
              <option value="fleet">Fleet</option>
              <option value="private">Private</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company number" value={data.company_number ?? ""} onChange={v => set("company_number", v)} />
            <Field label="VAT number" value={data.vat_number ?? ""} onChange={v => set("vat_number", v)} />
          </div>
          <Field label="Website" value={data.website ?? ""} onChange={v => set("website", v)} placeholder="https://" />
          <hr className="border-border" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Primary contact</p>
          <Field label="Contact name" value={data.contact_name ?? ""} onChange={v => set("contact_name", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact email" value={data.contact_email ?? ""} onChange={v => set("contact_email", v)} type="email" />
            <Field label="Contact mobile" value={data.contact_mobile ?? ""} onChange={v => set("contact_mobile", v)} type="tel" />
          </div>
          <Field label="Main phone" value={data.main_phone ?? ""} onChange={v => set("main_phone", v)} type="tel" />
          <Field label="Billing email *" value={data.billing_email ?? ""} onChange={v => set("billing_email", v)} type="email" />
        </>
      )}

      {step === 2 && (
        <>
          <Field label="Billing address" value={data.billing_address ?? ""} onChange={v => set("billing_address", v)} placeholder="Full invoice address" />
          <div>
            <Label className="text-xs text-muted-foreground">Payment terms *</Label>
            <select
              value={data.payment_terms ?? "Net 30"}
              onChange={e => set("payment_terms", e.target.value)}
              className="mt-1 w-full min-h-[40px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="Due on receipt">Due on receipt</option>
              <option value="Net 7">Net 7</option>
              <option value="Net 14">Net 14</option>
              <option value="Net 30">Net 30</option>
              <option value="Net 60">Net 60</option>
            </select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Rate type</Label>
            <select
              value={data.rate_type ?? "per_mile"}
              onChange={e => set("rate_type", e.target.value)}
              className="mt-1 w-full min-h-[40px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="per_mile">Per mile</option>
              <option value="per_job">Per job</option>
              <option value="hourly">Hourly</option>
              <option value="bespoke">Bespoke / quoted</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Rate value (£)"
              value={data.rate_value == null ? "" : String(data.rate_value)}
              onChange={v => set("rate_value", v ? Number(v) : null)}
              type="number"
            />
            <Field
              label="Minimum charge (£)"
              value={data.minimum_charge == null ? "" : String(data.minimum_charge)}
              onChange={v => set("minimum_charge", v ? Number(v) : null)}
              type="number"
            />
          </div>
          <Field
            label="Credit limit (£)"
            value={data.credit_limit == null ? "" : String(data.credit_limit)}
            onChange={v => set("credit_limit", v ? Number(v) : null)}
            type="number"
          />
        </>
      )}

      {step === 3 && (
        <>
          <ToggleRow
            label="Customer signature required"
            value={data.signature_required}
            onChange={v => set("signature_required", v)}
            hint="Drivers must capture customer signature on delivery."
          />
          <div>
            <Label className="text-xs text-muted-foreground">Handover requirements</Label>
            <Textarea
              value={data.handover_requirements ?? ""}
              onChange={e => set("handover_requirements", e.target.value)}
              rows={3}
              className="mt-1 text-sm resize-none"
              placeholder="Keys, paperwork, ID checks, photo proof…"
            />
          </div>
          <Field label="Opening hours" value={data.opening_hours ?? ""} onChange={v => set("opening_hours", v)} placeholder="e.g. Mon-Fri 08:00-18:00" />
          <div>
            <Label className="text-xs text-muted-foreground">Internal notes</Label>
            <Textarea
              value={data.notes ?? ""}
              onChange={e => set("notes", e.target.value)}
              rows={2}
              className="mt-1 text-sm resize-none"
            />
          </div>
          <hr className="border-border" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Documents</p>
          <DocumentsUploader
            orgId={orgId}
            relatedType="client"
            relatedId={clientId}
            slots={DOC_SLOTS}
          />
        </>
      )}
    </WizardShell>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 min-h-[40px] text-sm"
      />
    </div>
  );
}

function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start justify-between py-1">
      <div className="pr-3">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
