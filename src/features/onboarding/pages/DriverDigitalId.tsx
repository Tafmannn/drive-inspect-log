/**
 * DriverDigitalId — a driver's badge-style digital ID.
 *
 * Reachable at /profile/id (self, no :userId param — resolves to the
 * logged-in user) and /admin/drivers/:userId/id (admin viewing a specific
 * driver). Read-only: this is a presentation view, not another editor —
 * changes are made via the onboarding wizard / DriverProfileDetail as
 * today, this just gives the driver (and whoever they show it to) a
 * clean, single-glance identity card.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useProfilePhotoUrl } from "@/hooks/useProfilePhoto";
import { DriverIdCard } from "../components/DriverIdCard";

export default function DriverDigitalId() {
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const userId = paramUserId || user?.id || "";
  const isAdminView = !!paramUserId;

  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [dp, up] = await Promise.all([
        supabase.from("driver_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_profiles").select("*").eq("auth_user_id", userId).maybeSingle(),
      ]);
      setDriver(dp.data);
      setProfile(up.data);
    } catch (e) {
      toast({ title: "Failed to load", description: String((e as Error).message ?? e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const photoUrl = useProfilePhotoUrl(profile?.profile_photo_path ?? null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const name = driver?.full_name || profile?.display_name || profile?.email || "Driver";
  const backTarget = isAdminView ? `/admin/drivers/${userId}` : "/profile";

  if (!driver) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Digital ID" showBack onBack={() => navigate(backTarget)} />
        <div className="p-6 max-w-lg mx-auto text-center space-y-3">
          <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">No driver profile yet</h2>
          <p className="text-sm text-muted-foreground">
            {isAdminView
              ? "This driver's profile hasn't been set up yet."
              : "Your driver profile hasn't been set up yet. Contact your administrator."}
          </p>
          <Button variant="outline" onClick={() => navigate(backTarget)}>
            Back
          </Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <AppHeader title="Digital ID" showBack onBack={() => navigate(backTarget)} />

      <div className="p-4 max-w-md mx-auto">
        <DriverIdCard driver={driver} name={name} photoUrl={photoUrl} />

        <p className="text-[11px] text-muted-foreground text-center mt-3">
          This card is generated from your Axentra driver profile and updates automatically when your details change.
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
