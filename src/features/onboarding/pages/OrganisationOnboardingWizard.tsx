/**
 * OrganisationOnboardingWizard — 3-step org completion wizard.
 *
 * Steps: Identity · Branding · Plan + Documents
 *
 * Super-admin only. Writes to organisations row by id and saves
 * documents via DocumentsUploader against organisations.id.
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2 } from "lucide-react";
import { WizardShell, WizardStepDef } from "../components/WizardShell";
import { DocumentsUploader, DocumentSlot } from "../components/DocumentsUploader";

const STEPS: WizardStepDef[] = [
  { id: 1, title: "Identity", desc: "Legal entity and contact" },
  { id: 2, title: "Branding", desc: "Logo, primary colour and trading name" },
  { id: 3, title: "Plan & Documents", desc: "Subscription and supporting paperwork" },
];

const DOC_SLOTS: DocumentSlot[] = [
  { documentType: "incorporation", label: "Certificate of incorporation" },
  { documentType: "vat_certificate", label: "VAT certificate" },
  { documentType: "operator_licence", label: "Operator licence", needsExpiry: true },
];

type OrgRow = {
  id: string;
  name: string;
  legal_name: string | null;
  branding_name: string | null;
  company_number: string | null;
  vat_number: string | null;
  registered_address: string | null;
  trading_address: string | null;
  main_contact_name: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  logo_url: string | null;
  primary_colour: string | null;
  status: string;
  billing_plan: string | null;
  max_users: number | null;
  notes: string | null;
};

const EMPTY: Omit<OrgRow, "id"> = {
  name: "", legal_name: "", branding_name: "",
  company_number: "", vat_number: "",
  registered_address: "", trading_address: "",
  main_contact_name: "", main_contact_email: "", main_contact_phone: "",
  logo_url: "", primary_colour: "#0052CC",
  status: "active", billing_plan: "", max_users: null, notes: "",
};

export default function OrganisationOnboardingWizard() {
  const navigate = useNavigate();
  const { orgId = "" } = useParams<{ orgId: string }>();
  const [params] = useSearchParams();
  const justCreated = params.get("created") === "1";

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<typeof EMPTY>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: o, error } = await supabase
        .from("organisations")
        .select("*")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      if (o) {
        setData({
          name: o.name ?? "",
          legal_name: o.legal_name ?? "",
          branding_name: o.branding_name ?? "",
          company_number: o.company_number ?? "",
          vat_number: o.vat_number ?? "",
          registered_address: o.registered_address ?? "",
          trading_address: o.trading_address ?? "",
          main_contact_name: o.main_contact_name ?? "",
          main_contact_email: o.main_contact_email ?? "",
          main_contact_phone: o.main_contact_phone ?? "",
          logo_url: o.logo_url ?? "",
          primary_colour: o.primary_colour ?? "#0052CC",
          status: o.status ?? "active",
          billing_plan: o.billing_plan ?? "",
          max_users: o.max_users ?? null,
          notes: o.notes ?? "",
        });
      }
    } catch (e) {
      toast({ title: "Failed to load organisation", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const set = useCallback(<K extends keyof typeof EMPTY>(k: K, v: typeof EMPTY[K]) => {
    setData(prev => ({ ...prev, [k]: v }));
  }, []);

  const persist = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organisations")
        .update(data as never)
        .eq("id", orgId);
      if (error) throw error;
      return true;
    } catch (e) {
      toast({ title: "Save failed", description: String((e as Error).message ?? e), variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [data, orgId]);

  const validate = (s: number): string | null => {
    if (s === 1) {
      if (!data.name.trim()) return "Organisation name is required.";
      if (!data.main_contact_email?.trim()) return "Main contact email is required.";
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
    if (step < STEPS.length) setStep(step + 1);
    else {
      toast({ title: "Organisation onboarding saved" });
      navigate("/super-admin");
    }
  };

  const onBack = () => step > 1 && setStep(step - 1);

  const banner = useMemo(() => justCreated ? (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs">
          <span className="font-semibold">Organisation created.</span>{" "}
          Complete the steps below to finalise the tenant.
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
      title="Complete Organisation"
      steps={STEPS}
      current={step}
      onBack={onBack}
      onNext={onNext}
      saving={saving}
      isFirst={step === 1}
      isLast={step === STEPS.length}
      exitTo="/super-admin"
      banner={banner}
    >
      {step === 1 && (
        <>
          <Field label="Organisation Name *" value={data.name} onChange={v => set("name", v)} />
          <Field label="Legal entity name" value={data.legal_name ?? ""} onChange={v => set("legal_name", v)} placeholder="As registered" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Company number" value={data.company_number ?? ""} onChange={v => set("company_number", v)} />
            <Field label="VAT number" value={data.vat_number ?? ""} onChange={v => set("vat_number", v)} />
          </div>
          <Field label="Registered address" value={data.registered_address ?? ""} onChange={v => set("registered_address", v)} />
          <Field label="Trading address" value={data.trading_address ?? ""} onChange={v => set("trading_address", v)} placeholder="If different" />
          <hr className="border-border" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Main contact</p>
          <Field label="Contact name" value={data.main_contact_name ?? ""} onChange={v => set("main_contact_name", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact email *" value={data.main_contact_email ?? ""} onChange={v => set("main_contact_email", v)} type="email" />
            <Field label="Contact phone" value={data.main_contact_phone ?? ""} onChange={v => set("main_contact_phone", v)} type="tel" />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Field label="Branding name" value={data.branding_name ?? ""} onChange={v => set("branding_name", v)} placeholder="Public-facing brand name" />
          <Field label="Logo URL" value={data.logo_url ?? ""} onChange={v => set("logo_url", v)} placeholder="https://" />
          <div>
            <Label className="text-xs text-muted-foreground">Primary brand colour</Label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="color"
                value={data.primary_colour ?? "#0052CC"}
                onChange={e => set("primary_colour", e.target.value)}
                className="h-10 w-14 rounded border border-input bg-background"
                aria-label="Primary brand colour"
              />
              <Input
                value={data.primary_colour ?? ""}
                onChange={e => set("primary_colour", e.target.value)}
                placeholder="#0052CC"
                className="flex-1 min-h-[40px] text-sm font-mono"
              />
            </div>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground">Billing plan</Label>
            <select
              value={data.billing_plan ?? ""}
              onChange={e => set("billing_plan", e.target.value)}
              className="mt-1 w-full min-h-[40px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select…</option>
              <option value="trial">Trial</option>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <Field
            label="Max users"
            value={data.max_users == null ? "" : String(data.max_users)}
            onChange={v => set("max_users", v ? Number(v) : null)}
            type="number"
          />
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
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
            relatedType="organisation"
            relatedId={orgId}
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
