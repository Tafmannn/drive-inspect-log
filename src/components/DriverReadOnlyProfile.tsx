/**
 * Read-only operational identity card for drivers.
 * All fields are admin-managed. No edit capability.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, AlertCircle, MapPin, CreditCard, Car, Loader2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ProfileData {
  full_name: string;
  display_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address_line1: string | null;
  city: string | null;
  postcode: string | null;
  licence_number: string | null;
  licence_expiry: string | null;
  licence_categories: string[];
  trade_plate_number: string | null;
  employment_type: string | null;
  start_date: string | null;
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm text-foreground mt-0.5">
        {value || <span className="text-muted-foreground/50 italic">Not set</span>}
      </p>
    </div>
  );
}

export function DriverReadOnlyProfile({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("driver_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) {
        setProfile({
          full_name: data.full_name || "",
          display_name: data.display_name,
          phone: data.phone,
          date_of_birth: data.date_of_birth,
          emergency_contact_name: data.emergency_contact_name,
          emergency_contact_phone: data.emergency_contact_phone,
          address_line1: data.address_line1,
          city: data.city,
          postcode: data.postcode,
          licence_number: data.licence_number,
          licence_expiry: data.licence_expiry,
          licence_categories: data.licence_categories || [],
          trade_plate_number: data.trade_plate_number,
          employment_type: data.employment_type,
          start_date: data.start_date,
        });
      }
    } catch { /* no profile */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Your driver profile has not been set up yet. Contact your administrator.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB") : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Driver Details</h2>
        <Badge variant="outline" className="text-[10px]">Admin-managed</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <User className="w-3.5 h-3.5" />Personal
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
          <ReadOnlyField label="Full Name" value={profile.full_name} />
          <ReadOnlyField label="Preferred Name" value={profile.display_name} />
          <ReadOnlyField label="Phone" value={profile.phone} />
          <ReadOnlyField label="Date of Birth" value={fmtDate(profile.date_of_birth)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <AlertCircle className="w-3.5 h-3.5" />Emergency Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
          <ReadOnlyField label="Name" value={profile.emergency_contact_name} />
          <ReadOnlyField label="Phone" value={profile.emergency_contact_phone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <CreditCard className="w-3.5 h-3.5" />Licence
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ReadOnlyField label="Number" value={profile.licence_number} />
            <ReadOnlyField label="Expiry" value={fmtDate(profile.licence_expiry)} />
          </div>
          {profile.licence_categories.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">Categories</p>
              <div className="flex flex-wrap gap-1">
                {profile.licence_categories.map(c => (
                  <Badge key={c} variant="secondary" className="text-[10px] px-2 py-0.5">{c}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <Car className="w-3.5 h-3.5" />Work
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-2 gap-3">
          <ReadOnlyField label="Trade Plate" value={profile.trade_plate_number} />
          <ReadOnlyField label="Employment" value={profile.employment_type} />
          <ReadOnlyField label="Start Date" value={fmtDate(profile.start_date)} />
        </CardContent>
      </Card>
    </div>
  );
}
