import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  User,
  Receipt,
  Upload,
  LogOut,
  Save,
  ChevronRight,
  BarChart3,
  Shield,
  Car,
  MapPin,
  CreditCard,
  AlertCircle,
  Edit2,
  Loader2,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/* ── Driver profile form ─────────────────────────────────────────── */

interface DriverProfileData {
  full_name: string;
  display_name: string;
  phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  date_of_birth: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postcode: string;
  licence_number: string;
  licence_expiry: string;
  licence_categories: string[];
  trade_plate_number: string;
  employment_type: string;
  start_date: string;
  notes: string;
}

const EMPTY: DriverProfileData = {
  full_name: "",
  display_name: "",
  phone: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  date_of_birth: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postcode: "",
  licence_number: "",
  licence_expiry: "",
  licence_categories: [],
  trade_plate_number: "",
  employment_type: "contractor",
  start_date: "",
  notes: "",
};

const CATS = ["AM", "A1", "A2", "A", "B", "B+E", "C1", "C1+E", "C", "C+E", "D1", "D1+E", "D", "D+E"];

interface ProfileFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function ProfileField({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  disabled = false,
  className = "",
}: ProfileFieldProps) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`mt-1 min-h-[40px] text-sm disabled:opacity-70 ${className}`}
      />
    </div>
  );
}

function DriverProfileForm({ userId, orgId }: { userId: string; orgId: string }) {
  const [p, setP] = useState<DriverProfileData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("driver_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (data) {
        setP({
          full_name: data.full_name || "",
          display_name: data.display_name || "",
          phone: data.phone || "",
          emergency_contact_name: data.emergency_contact_name || "",
          emergency_contact_phone: data.emergency_contact_phone || "",
          date_of_birth: data.date_of_birth || "",
          address_line1: data.address_line1 || "",
          address_line2: data.address_line2 || "",
          city: data.city || "",
          postcode: data.postcode || "",
          licence_number: data.licence_number || "",
          licence_expiry: data.licence_expiry || "",
          licence_categories: data.licence_categories || [],
          trade_plate_number: data.trade_plate_number || "",
          employment_type: data.employment_type || "contractor",
          start_date: data.start_date || "",
          notes: data.notes || "",
        });
      } else {
        setP(EMPTY);
      }
    } catch {
      setP(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key: keyof DriverProfileData, value: string) => {
    setP((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleCat = (category: string) => {
    setP((prev) => ({
      ...prev,
      licence_categories: prev.licence_categories.includes(category)
        ? prev.licence_categories.filter((x) => x !== category)
        : [...prev.licence_categories, category],
    }));
  };

  const handleCancel = async () => {
    setEditing(false);
    await load();
  };

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("driver_profiles").upsert(
        {
          user_id: userId,
          org_id: orgId,
          ...p,
          date_of_birth: p.date_of_birth || null,
          licence_expiry: p.licence_expiry || null,
          start_date: p.start_date || null,
        } as any,
        { onConflict: "user_id,org_id" }
      );

      if (error) throw error;

      setEditing(false);
      toast({ title: "Driver profile saved ✓" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Driver Details</h2>

        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Save className="w-3 h-3 mr-1" />
              )}
              Save
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Edit2 className="w-3 h-3 mr-1" />
            Edit
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <User className="w-3.5 h-3.5" />
            Personal Details
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
          <ProfileField
            label="Full Name"
            value={p.full_name}
            onChange={(v) => setField("full_name", v)}
            placeholder="As on licence"
            disabled={!editing}
          />
          <ProfileField
            label="Preferred Name"
            value={p.display_name}
            onChange={(v) => setField("display_name", v)}
            placeholder="Display name"
            disabled={!editing}
          />
          <ProfileField
            label="Mobile Phone"
            value={p.phone}
            onChange={(v) => setField("phone", v)}
            type="tel"
            placeholder="+44 7700 000000"
            disabled={!editing}
          />
          <ProfileField
            label="Date of Birth"
            value={p.date_of_birth}
            onChange={(v) => setField("date_of_birth", v)}
            type="date"
            disabled={!editing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <AlertCircle className="w-3.5 h-3.5" />
            Emergency Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
          <ProfileField
            label="Contact Name"
            value={p.emergency_contact_name}
            onChange={(v) => setField("emergency_contact_name", v)}
            placeholder="Full name"
            disabled={!editing}
          />
          <ProfileField
            label="Contact Phone"
            value={p.emergency_contact_phone}
            onChange={(v) => setField("emergency_contact_phone", v)}
            type="tel"
            placeholder="+44 7700 000000"
            disabled={!editing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <MapPin className="w-3.5 h-3.5" />
            Home Address
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <ProfileField
            label="Address Line 1"
            value={p.address_line1}
            onChange={(v) => setField("address_line1", v)}
            placeholder="Street address"
            disabled={!editing}
          />
          <ProfileField
            label="Address Line 2"
            value={p.address_line2}
            onChange={(v) => setField("address_line2", v)}
            placeholder="Flat, building (optional)"
            disabled={!editing}
          />
          <div className="grid grid-cols-2 gap-3">
            <ProfileField
              label="City / Town"
              value={p.city}
              onChange={(v) => setField("city", v)}
              placeholder="City"
              disabled={!editing}
            />
            <ProfileField
              label="Postcode"
              value={p.postcode}
              onChange={(v) => setField("postcode", v)}
              placeholder="SW1A 1AA"
              disabled={!editing}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <CreditCard className="w-3.5 h-3.5" />
            Driving Licence
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ProfileField
              label="Licence Number"
              value={p.licence_number}
              onChange={(v) => setField("licence_number", v)}
              placeholder="SMITH123456AB9CD"
              disabled={!editing}
            />
            <ProfileField
              label="Expiry Date"
              value={p.licence_expiry}
              onChange={(v) => setField("licence_expiry", v)}
              type="date"
              disabled={!editing}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Licence Categories</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CATS.map((category) => (
                <button
                  key={category}
                  type="button"
                  disabled={!editing}
                  onClick={() => toggleCat(category)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-60 disabled:cursor-default ${
                    p.licence_categories.includes(category)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <Car className="w-3.5 h-3.5" />
            Work Details
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Trade Plate Number</Label>
              <Input
                value={p.trade_plate_number}
                onChange={(e) => setField("trade_plate_number", e.target.value.toUpperCase())}
                placeholder="e.g. 123456"
                disabled={!editing}
                className="mt-1 min-h-[40px] text-sm font-mono uppercase disabled:opacity-70"
              />
            </div>

            <ProfileField
              label="Start Date"
              value={p.start_date}
              onChange={(v) => setField("start_date", v)}
              type="date"
              disabled={!editing}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Employment Type</Label>
            <Select
              value={p.employment_type}
              onValueChange={(v) => setField("employment_type", v)}
              disabled={!editing}
            >
              <SelectTrigger className="mt-1 min-h-[40px] text-sm">
                <SelectValue />
              </SelectTrigger>
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
            <Textarea
              value={p.notes}
              onChange={(e) => setField("notes", e.target.value)}
              disabled={!editing}
              placeholder="Certifications, vehicle restrictions, notes..."
              rows={2}
              className="mt-1 text-sm resize-none disabled:opacity-70"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Main Profile Page ───────────────────────────────────────────── */

export const Profile = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin, logout } = useAuth();
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [expenseTotal, setExpenseTotal] = useState<string | null>(null);
  const [orgId, setOrgId] = useState("a0000000-0000-0000-0000-000000000001");

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const id = session?.user?.user_metadata?.org_id ?? session?.user?.app_metadata?.org_id;
        if (id) setOrgId(id);
      } catch {
        // use default
      }
    })();

    (async () => {
      try {
        const { count } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("is_hidden", false);
        setJobCount(count ?? 0);
      } catch {
        setJobCount(null);
      }
    })();

    (async () => {
      try {
        const monthStart = new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1
        ).toISOString();

        const { data } = await supabase
          .from("expenses")
          .select("amount")
          .eq("is_hidden", false)
          .gte("date", monthStart);

        if (data) {
          setExpenseTotal(`£${data.reduce((sum, expense) => sum + (expense.amount ?? 0), 0).toFixed(2)}`);
        }
      } catch {
        setExpenseTotal(null);
      }
    })();
  }, []);

  const roleLabels: string[] = [];
  if (isSuperAdmin) roleLabels.push("Super Admin");
  else if (isAdmin) roleLabels.push("Admin");
  if (user?.roles.includes("DRIVER")) roleLabels.push("Driver");

  const adminLinks = [
    { icon: BarChart3, label: "Admin Dashboard", path: "/admin", visible: isAdmin || isSuperAdmin },
    { icon: Shield, label: "Super Admin Control Centre", path: "/super-admin", visible: isSuperAdmin },
  ].filter((link) => link.visible);

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="My Profile" />

      <div className="px-4 py-6 space-y-6 max-w-lg mx-auto">
        <div className="flex flex-col items-center gap-2">
          <div className="w-[72px] h-[72px] rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-9 h-9 text-primary" />
          </div>
          <p className="text-lg font-semibold">{user?.name || "Unknown user"}</p>
          <p className="text-sm text-muted-foreground">{user?.email || "No email set"}</p>
          <div className="flex gap-1.5 mt-1 flex-wrap justify-center">
            {roleLabels.map((role) => (
              <Badge key={role} variant="secondary" className="text-xs">
                {role}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{jobCount ?? "–"}</p>
              <p className="text-xs text-muted-foreground">Total Jobs</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{expenseTotal ?? "–"}</p>
              <p className="text-xs text-muted-foreground">Expenses This Month</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2">
          {[
            { icon: Receipt, label: "Expenses", path: "/expenses" },
            { icon: Upload, label: "Pending Uploads", path: "/pending-uploads" },
          ].map(({ icon: Icon, label, path }) => (
            <Card
              key={path}
              className="cursor-pointer active:bg-muted/50"
              onClick={() => navigate(path)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm font-medium flex-1">{label}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>

        {adminLinks.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mb-2">
                Administration
              </p>
              {adminLinks.map(({ icon: Icon, label, path }) => (
                <Card
                  key={path}
                  className="cursor-pointer active:bg-muted/50 border-primary/20"
                  onClick={() => navigate(path)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-sm font-medium flex-1">{label}</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        <Separator />

        {user?.roles.includes("DRIVER") && user.id && (
          <DriverProfileForm userId={user.id} orgId={orgId} />
        )}

        <Separator />

        <Button
          variant="destructive"
          className="w-full min-h-[48px]"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>

      <BottomNav />
    </div>
  );
};