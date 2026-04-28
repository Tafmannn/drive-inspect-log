/**
 * DriverOnboardingWizard — 5-step driver completion wizard.
 *
 * Steps: Personal · Compliance · Operations · Finance · Documents
 *
 * Reads/writes the driver_profiles row keyed by user_id; documents
 * are saved via DocumentsUploader against driver_profiles.id.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2 } from "lucide-react";
import { WizardShell, WizardStepDef } from "../components/WizardShell";
import { DocumentsUploader, DocumentSlot } from "../components/DocumentsUploader";

const STEPS: WizardStepDef[] = [
  { id: 1, title: "Personal", desc: "Name, contact and emergency contact" },
  { id: 2, title: "Compliance", desc: "Licence, endorsements and right to work" },
  { id: 3, title: "Operations", desc: "Regions, range and capabilities" },
  { id: 4, title: "Finance", desc: "Payout terms and bank capture" },
  { id: 5, title: "Documents", desc: "Licence scans and supporting paperwork" },
];

const DOC_SLOTS: DocumentSlot[] = [
  { documentType: "licence_front", label: "Driving licence (front)", required: true },
  { documentType: "licence_back", label: "Driving licence (back)", required: true },
  { documentType: "right_to_work", label: "Right to work proof", required: true, needsExpiry: true },
  { documentType: "proof_of_address", label: "Proof of address" },
  { documentType: "insurance", label: "Hire & reward insurance", needsExpiry: true },
  { documentType: "signed_agreement", label: "Signed contractor agreement" },
];

type DriverRow = {
  id?: string;
  user_id: string;
  org_id: string;
  full_name: string;
  display_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  home_postcode: string | null;
  licence_number: string | null;
  licence_expiry: string | null;
  licence_categories: string[] | null;
  endorsements: string | null;
  right_to_work: string | null;
  trade_plate_number: string | null;
  employment_type: string | null;
  preferred_regions: string[] | null;
  unavailable_regions: string[] | null;
  max_daily_distance: number | null;
  ev_capable: boolean;
  prestige_approved: boolean;
  manual_capable: boolean;
  automatic_capable: boolean;
  availability_notes: string | null;
  payout_terms: string | null;
  bank_captured: boolean;
  notes: string | null;
};

const EMPTY: Omit<DriverRow, "user_id" | "org_id"> = {
  full_name: "", display_name: "", phone: "", date_of_birth: "",
  emergency_contact_name: "", emergency_contact_phone: "",
  address_line1: "", address_line2: "", city: "", postcode: "",
  home_postcode: "", licence_number: "", licence_expiry: "",
  licence_categories: [], endorsements: "", right_to_work: "",
  trade_plate_number: "", employment_type: "contractor",
  preferred_regions: [], unavailable_regions: [], max_daily_distance: null,
  ev_capable: false, prestige_approved: false,
  manual_capable: true, automatic_capable: true,
  availability_notes: "", payout_terms: "", bank_captured: false, notes: "",
};

const REGION_PRESETS = [
  "London", "South East", "South West", "East",
  "Midlands", "North West", "North East", "Scotland", "Wales",
];

export default function DriverOnboardingWizard() {
  const navigate = useNavigate();
  const { userId = "" } = useParams<{ userId: string }>();
  const [params] = useSearchParams();
  const justCreated = params.get("created") === "1";

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string>("");
  const [driverProfileId, setDriverProfileId] = useState<string>("");
  const [data, setData] = useState<typeof EMPTY>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Find this user's org via user_profiles
      const { data: prof } = await supabase
        .from("user_profiles")
        .select("org_id")
        .eq("auth_user_id", userId)
        .maybeSingle();
      const resolvedOrg = prof?.org_id ?? "";
      setOrgId(resolvedOrg);

      const { data: dp } = await supabase
        .from("driver_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (dp) {
        setDriverProfileId(dp.id);
        setData({
          full_name: dp.full_name ?? "",
          display_name: dp.display_name ?? "",
          phone: dp.phone ?? "",
          date_of_birth: dp.date_of_birth ?? "",
          emergency_contact_name: dp.emergency_contact_name ?? "",
          emergency_contact_phone: dp.emergency_contact_phone ?? "",
          address_line1: dp.address_line1 ?? "",
          address_line2: dp.address_line2 ?? "",
          city: dp.city ?? "",
          postcode: dp.postcode ?? "",
          home_postcode: dp.home_postcode ?? "",
          licence_number: dp.licence_number ?? "",
          licence_expiry: dp.licence_expiry ?? "",
          licence_categories: dp.licence_categories ?? [],
          endorsements: dp.endorsements ?? "",
          right_to_work: dp.right_to_work ?? "",
          trade_plate_number: dp.trade_plate_number ?? "",
          employment_type: dp.employment_type ?? "contractor",
          preferred_regions: dp.preferred_regions ?? [],
          unavailable_regions: dp.unavailable_regions ?? [],
          max_daily_distance: dp.max_daily_distance ?? null,
          ev_capable: dp.ev_capable ?? false,
          prestige_approved: dp.prestige_approved ?? false,
          manual_capable: dp.manual_capable ?? true,
          automatic_capable: dp.automatic_capable ?? true,
          availability_notes: dp.availability_notes ?? "",
          payout_terms: dp.payout_terms ?? "",
          bank_captured: dp.bank_captured ?? false,
          notes: dp.notes ?? "",
        });
      }
    } catch (e) {
      toast({ title: "Failed to load", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const set = useCallback(<K extends keyof typeof EMPTY>(k: K, v: typeof EMPTY[K]) => {
    setData(prev => ({ ...prev, [k]: v }));
  }, []);

  const persist = useCallback(async (): Promise<string | null> => {
    if (!orgId) {
      toast({ title: "Missing organisation", description: "User has no org assigned.", variant: "destructive" });
      return null;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        org_id: orgId,
        full_name: data.full_name || "",
        display_name: data.display_name || null,
        phone: data.phone || null,
        date_of_birth: data.date_of_birth || null,
        emergency_contact_name: data.emergency_contact_name || null,
        emergency_contact_phone: data.emergency_contact_phone || null,
        address_line1: data.address_line1 || null,
        address_line2: data.address_line2 || null,
        city: data.city || null,
        postcode: data.postcode || null,
        home_postcode: data.home_postcode || null,
        licence_number: data.licence_number || null,
        licence_expiry: data.licence_expiry || null,
        licence_categories: data.licence_categories ?? [],
        endorsements: data.endorsements || null,
        right_to_work: data.right_to_work || null,
        trade_plate_number: data.trade_plate_number || null,
        employment_type: data.employment_type || "contractor",
        preferred_regions: data.preferred_regions ?? [],
        unavailable_regions: data.unavailable_regions ?? [],
        max_daily_distance: data.max_daily_distance,
        ev_capable: data.ev_capable,
        prestige_approved: data.prestige_approved,
        manual_capable: data.manual_capable,
        automatic_capable: data.automatic_capable,
        availability_notes: data.availability_notes || null,
        payout_terms: data.payout_terms || null,
        bank_captured: data.bank_captured,
        notes: data.notes || null,
      };

      const { data: saved, error } = await supabase
        .from("driver_profiles")
        .upsert(payload as never, { onConflict: "user_id" })
        .select("id")
        .single();
      if (error) throw error;
      if (saved?.id) setDriverProfileId(saved.id);
      return saved?.id ?? driverProfileId;
    } catch (e) {
      toast({ title: "Save failed", description: String((e as Error).message ?? e), variant: "destructive" });
      return null;
    } finally {
      setSaving(false);
    }
  }, [orgId, userId, data, driverProfileId]);

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!data.full_name.trim()) return "Full name is required.";
      if (!data.phone?.trim()) return "Mobile phone is required.";
    }
    if (s === 2) {
      if (!data.licence_number?.trim()) return "Licence number is required.";
      if (!data.licence_expiry) return "Licence expiry is required.";
      if (!data.right_to_work?.trim()) return "Right to work status is required.";
    }
    return null;
  };

  const onNext = async () => {
    const err = validateStep(step);
    if (err) {
      toast({ title: "Please complete this step", description: err, variant: "destructive" });
      return;
    }
    const savedId = await persist();
    if (!savedId) return;

    if (step < STEPS.length) {
      setStep(step + 1);
    } else {
      toast({ title: "Driver onboarding saved" });
      navigate("/admin/drivers");
    }
  };

  const onBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const toggleArr = (k: "licence_categories" | "preferred_regions" | "unavailable_regions", v: string) => {
    setData(prev => {
      const list = prev[k] ?? [];
      return {
        ...prev,
        [k]: list.includes(v) ? list.filter(x => x !== v) : [...list, v],
      };
    });
  };

  const banner = useMemo(() => justCreated ? (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-3 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs">
          <span className="font-semibold">Driver account created.</span>{" "}
          Complete the steps below to make this driver dispatch-eligible.
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

  const CATS = ["B", "B+E", "C1", "C1+E", "C", "C+E", "D1", "D"];

  return (
    <WizardShell
      title="Complete Driver Profile"
      steps={STEPS}
      current={step}
      onBack={onBack}
      onNext={onNext}
      saving={saving}
      isFirst={step === 1}
      isLast={step === STEPS.length}
      exitTo="/admin/drivers"
      banner={banner}
      nextLabel={step === STEPS.length ? "Finish" : undefined}
    >
      {step === 1 && (
        <>
          <Field label="Full Name *" value={data.full_name} onChange={v => set("full_name", v)} placeholder="As on driving licence" />
          <Field label="Preferred Name" value={data.display_name ?? ""} onChange={v => set("display_name", v)} placeholder="Display name" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mobile *" value={data.phone ?? ""} onChange={v => set("phone", v)} type="tel" placeholder="+44 7700 000000" />
            <Field label="Date of Birth" value={data.date_of_birth ?? ""} onChange={v => set("date_of_birth", v)} type="date" />
          </div>
          <hr className="border-border" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Emergency contact</p>
          <Field label="Contact Name" value={data.emergency_contact_name ?? ""} onChange={v => set("emergency_contact_name", v)} />
          <Field label="Contact Phone" value={data.emergency_contact_phone ?? ""} onChange={v => set("emergency_contact_phone", v)} type="tel" />
          <hr className="border-border" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Home address</p>
          <Field label="Address Line 1" value={data.address_line1 ?? ""} onChange={v => set("address_line1", v)} />
          <Field label="Address Line 2" value={data.address_line2 ?? ""} onChange={v => set("address_line2", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={data.city ?? ""} onChange={v => set("city", v)} />
            <Field label="Postcode" value={data.postcode ?? ""} onChange={v => set("postcode", v)} />
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Licence Number *" value={data.licence_number ?? ""} onChange={v => set("licence_number", v)} placeholder="SMITH123456AB9CD" />
            <Field label="Licence Expiry *" value={data.licence_expiry ?? ""} onChange={v => set("licence_expiry", v)} type="date" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Licence categories</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CATS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleArr("licence_categories", c)}
                  className={
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors " +
                    ((data.licence_categories ?? []).includes(c)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border")
                  }
                >{c}</button>
              ))}
            </div>
          </div>
          <Field label="Endorsements" value={data.endorsements ?? ""} onChange={v => set("endorsements", v)} placeholder="e.g. SP30 (3pts) 2023" />
          <div>
            <Label className="text-xs text-muted-foreground">Right to work *</Label>
            <select
              value={data.right_to_work ?? ""}
              onChange={e => set("right_to_work", e.target.value)}
              className="mt-1 w-full min-h-[40px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select…</option>
              <option value="british_citizen">British citizen</option>
              <option value="settled_status">Settled status</option>
              <option value="visa_with_right">Visa with right to work</option>
              <option value="not_verified">Not verified</option>
            </select>
          </div>
          <Field label="Trade plate number" value={data.trade_plate_number ?? ""} onChange={v => set("trade_plate_number", v.toUpperCase())} placeholder="e.g. 123456" />
          <div>
            <Label className="text-xs text-muted-foreground">Employment type</Label>
            <select
              value={data.employment_type ?? "contractor"}
              onChange={e => set("employment_type", e.target.value)}
              className="mt-1 w-full min-h-[40px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="employed">Employed</option>
              <option value="contractor">Contractor</option>
              <option value="agency">Agency</option>
              <option value="self_employed">Self-employed</option>
            </select>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <Field label="Home postcode (operations)" value={data.home_postcode ?? ""} onChange={v => set("home_postcode", v.toUpperCase())} placeholder="Used for routing" />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Max daily distance (mi)"
              value={data.max_daily_distance == null ? "" : String(data.max_daily_distance)}
              onChange={v => set("max_daily_distance", v ? Number(v) : null)}
              type="number"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Preferred regions</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {REGION_PRESETS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleArr("preferred_regions", r)}
                  className={
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors " +
                    ((data.preferred_regions ?? []).includes(r)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border")
                  }
                >{r}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Unavailable regions</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {REGION_PRESETS.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleArr("unavailable_regions", r)}
                  className={
                    "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors " +
                    ((data.unavailable_regions ?? []).includes(r)
                      ? "bg-destructive text-destructive-foreground border-destructive"
                      : "bg-background text-muted-foreground border-border")
                  }
                >{r}</button>
              ))}
            </div>
          </div>
          <ToggleRow label="Manual gearbox" value={data.manual_capable} onChange={v => set("manual_capable", v)} />
          <ToggleRow label="Automatic gearbox" value={data.automatic_capable} onChange={v => set("automatic_capable", v)} />
          <ToggleRow label="EV capable" value={data.ev_capable} onChange={v => set("ev_capable", v)} />
          <ToggleRow label="Prestige approved" value={data.prestige_approved} onChange={v => set("prestige_approved", v)} />
          <div>
            <Label className="text-xs text-muted-foreground">Availability notes</Label>
            <Textarea
              value={data.availability_notes ?? ""}
              onChange={e => set("availability_notes", e.target.value)}
              rows={2}
              className="mt-1 text-sm resize-none"
              placeholder="Working pattern, days off, restrictions"
            />
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground">Payout terms</Label>
            <select
              value={data.payout_terms ?? ""}
              onChange={e => set("payout_terms", e.target.value)}
              className="mt-1 w-full min-h-[40px] rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select…</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
              <option value="per_job">Per job</option>
            </select>
          </div>
          <ToggleRow
            label="Bank details captured"
            value={data.bank_captured}
            onChange={v => set("bank_captured", v)}
            hint="Toggle on once sort code & account number are securely held."
          />
          <div>
            <Label className="text-xs text-muted-foreground">Internal notes</Label>
            <Textarea
              value={data.notes ?? ""}
              onChange={e => set("notes", e.target.value)}
              rows={3}
              className="mt-1 text-sm resize-none"
              placeholder="Any other operational or finance notes (admin only)"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bank details and other sensitive financial data should be captured in your secure
            payments system, not stored here.
          </p>
        </>
      )}

      {step === 5 && (
        <>
          {!driverProfileId ? (
            <p className="text-sm text-muted-foreground">
              Save the previous steps first to enable document uploads.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Upload supporting documents. Files are stored securely and visible only to your organisation.
              </p>
              <DocumentsUploader
                orgId={orgId}
                relatedType="driver"
                relatedId={driverProfileId}
                slots={DOC_SLOTS}
              />
              <div className="rounded-md border border-dashed border-border p-3 mt-2">
                <p className="text-xs">
                  <Badge variant="secondary" className="mr-1 text-[10px]">Tip</Badge>
                  Tap <span className="font-semibold">Finish</span> when uploads are complete.
                </p>
              </div>
            </>
          )}
        </>
      )}
    </WizardShell>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}

function Field({ label, value, onChange, type = "text", placeholder }: FieldProps) {
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
