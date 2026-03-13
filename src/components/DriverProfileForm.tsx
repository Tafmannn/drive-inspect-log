import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { User, AlertCircle, MapPin, CreditCard, Car, Save, Edit2, Loader2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface DriverProfileData {
  full_name: string; display_name: string; phone: string;
  emergency_contact_name: string; emergency_contact_phone: string;
  date_of_birth: string; address_line1: string; address_line2: string;
  city: string; postcode: string; licence_number: string;
  licence_expiry: string; licence_categories: string[];
  trade_plate_number: string; employment_type: string;
  start_date: string; notes: string;
}

const EMPTY: DriverProfileData = {
  full_name:"", display_name:"", phone:"", emergency_contact_name:"",
  emergency_contact_phone:"", date_of_birth:"", address_line1:"",
  address_line2:"", city:"", postcode:"", licence_number:"",
  licence_expiry:"", licence_categories:[], trade_plate_number:"",
  employment_type:"contractor", start_date:"", notes:"",
};

const CATS = ["AM","A1","A2","A","B","B+E","C1","C1+E","C","C+E","D1","D1+E","D","D+E"];

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}

const Field = ({ label, value, onChange, type = "text", placeholder = "", disabled }: FieldProps) => (
  <div>
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="mt-1 min-h-[40px] text-sm disabled:opacity-70"
    />
  </div>
);

export function DriverProfileForm({ userId, orgId }: { userId: string; orgId: string }) {
  const [p, setP] = useState<DriverProfileData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("driver_profiles").select("*").eq("user_id", userId).maybeSingle();
      if (data) {
        setP({
          full_name: data.full_name || "", display_name: data.display_name || "",
          phone: data.phone || "", emergency_contact_name: data.emergency_contact_name || "",
          emergency_contact_phone: data.emergency_contact_phone || "",
          date_of_birth: data.date_of_birth || "", address_line1: data.address_line1 || "",
          address_line2: data.address_line2 || "", city: data.city || "",
          postcode: data.postcode || "", licence_number: data.licence_number || "",
          licence_expiry: data.licence_expiry || "", licence_categories: data.licence_categories || [],
          trade_plate_number: data.trade_plate_number || "",
          employment_type: data.employment_type || "contractor",
          start_date: data.start_date || "", notes: data.notes || "",
        });
      }
    } catch { /* no profile yet */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const set = useCallback((k: keyof DriverProfileData, v: string) => {
    setP(prev => ({ ...prev, [k]: v }));
  }, []);

  const toggleCat = useCallback((c: string) => {
    setP(prev => ({
      ...prev,
      licence_categories: prev.licence_categories.includes(c)
        ? prev.licence_categories.filter(x => x !== c)
        : [...prev.licence_categories, c],
    }));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("driver_profiles").upsert(
        {
          user_id: userId, org_id: orgId, ...p,
          date_of_birth: p.date_of_birth || null,
          licence_expiry: p.licence_expiry || null,
          start_date: p.start_date || null,
        } as any,
        { onConflict: "user_id,org_id" }
      );
      if (error) throw error;
      setEditing(false);
      toast({ title: "Driver profile saved" });
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-6">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Driver Details</h2>
        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); load(); }}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}Save
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Edit2 className="w-3 h-3 mr-1" />Edit
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <User className="w-3.5 h-3.5" />Personal Details
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
          <Field label="Full Name" value={p.full_name} onChange={v => set("full_name", v)} placeholder="As on licence" disabled={!editing} />
          <Field label="Preferred Name" value={p.display_name} onChange={v => set("display_name", v)} placeholder="Display name" disabled={!editing} />
          <Field label="Mobile Phone" value={p.phone} onChange={v => set("phone", v)} type="tel" placeholder="+44 7700 000000" disabled={!editing} />
          <Field label="Date of Birth" value={p.date_of_birth} onChange={v => set("date_of_birth", v)} type="date" disabled={!editing} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <AlertCircle className="w-3.5 h-3.5" />Emergency Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
          <Field label="Contact Name" value={p.emergency_contact_name} onChange={v => set("emergency_contact_name", v)} placeholder="Full name" disabled={!editing} />
          <Field label="Contact Phone" value={p.emergency_contact_phone} onChange={v => set("emergency_contact_phone", v)} type="tel" placeholder="+44 7700 000000" disabled={!editing} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <MapPin className="w-3.5 h-3.5" />Home Address
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Field label="Address Line 1" value={p.address_line1} onChange={v => set("address_line1", v)} placeholder="Street address" disabled={!editing} />
          <Field label="Address Line 2" value={p.address_line2} onChange={v => set("address_line2", v)} placeholder="Flat, building (optional)" disabled={!editing} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City / Town" value={p.city} onChange={v => set("city", v)} placeholder="City" disabled={!editing} />
            <Field label="Postcode" value={p.postcode} onChange={v => set("postcode", v)} placeholder="SW1A 1AA" disabled={!editing} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <CreditCard className="w-3.5 h-3.5" />Driving Licence
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Licence Number" value={p.licence_number} onChange={v => set("licence_number", v)} placeholder="SMITH123456AB9CD" disabled={!editing} />
            <Field label="Expiry Date" value={p.licence_expiry} onChange={v => set("licence_expiry", v)} type="date" disabled={!editing} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Licence Categories</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CATS.map(c => (
                <button key={c} type="button" disabled={!editing} onClick={() => toggleCat(c)}
                  className={"px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-60 disabled:cursor-default " +
                    (p.licence_categories.includes(c)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border")
                  }
                >{c}</button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <Car className="w-3.5 h-3.5" />Work Details
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Trade Plate Number</Label>
              <Input value={p.trade_plate_number}
                onChange={e => set("trade_plate_number", e.target.value.toUpperCase())}
                placeholder="e.g. 123456" disabled={!editing}
                className="mt-1 min-h-[40px] text-sm font-mono uppercase disabled:opacity-70" />
            </div>
            <Field label="Start Date" value={p.start_date} onChange={v => set("start_date", v)} type="date" disabled={!editing} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Employment Type</Label>
            <Select value={p.employment_type} onValueChange={v => set("employment_type", v)} disabled={!editing}>
              <SelectTrigger className="mt-1 min-h-[40px] text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employed">Employed</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="agency">Agency</SelectItem>
                <SelectItem value="self_employed">Self-Employed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes / Certifications</Label>
            <Textarea value={p.notes} onChange={e => set("notes", e.target.value)}
              disabled={!editing}
              placeholder="Certifications, vehicle restrictions, notes..."
              rows={2} className="mt-1 text-sm resize-none disabled:opacity-70" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
