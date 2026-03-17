import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DriverReadOnlyProfile } from "@/components/DriverReadOnlyProfile";
import { DriverProfileForm } from "@/components/DriverProfileForm";
import { useAuth } from "@/context/AuthContext";
import { useDriverGate } from "@/hooks/useDriverGate";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  ChevronRight,
  LogOut,
  Receipt,
  Shield,
  Upload,
  User,
} from "lucide-react";

export const Profile = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin, logout } = useAuth();
  const gate = useDriverGate();

  const [jobCount, setJobCount] = useState<number | null>(null);
  const [expenseTotal, setExpenseTotal] = useState<string | null>(null);
  const [orgId, setOrgId] = useState("a0000000-0000-0000-0000-000000000001");

  const isDriverOnly = gate.isDriverOnly;

  useEffect(() => {
    const loadOrgId = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const id = session?.user?.user_metadata?.org_id ?? session?.user?.app_metadata?.org_id;
        if (id) setOrgId(id);
      } catch { /* keep fallback */ }
    };

    const loadJobCount = async () => {
      try {
        const { count } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("is_hidden", false);
        setJobCount(count ?? 0);
      } catch { setJobCount(null); }
    };

    const loadExpenseTotal = async () => {
      try {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { data } = await supabase
          .from("expenses")
          .select("amount")
          .eq("is_hidden", false)
          .gte("date", monthStart);
        if (data) {
          const total = data.reduce((sum, expense) => sum + (expense.amount ?? 0), 0);
          setExpenseTotal(`£${total.toFixed(2)}`);
        } else {
          setExpenseTotal("£0.00");
        }
      } catch { setExpenseTotal(null); }
    };

    void loadOrgId();
    // Only load global stats for admins
    if (!isDriverOnly) {
      void loadJobCount();
      void loadExpenseTotal();
    }
  }, [isDriverOnly]);

  const roleLabels: string[] = [];
  if (isSuperAdmin) roleLabels.push("Super Admin");
  else if (isAdmin) roleLabels.push("Admin");
  if (user?.roles?.includes("DRIVER")) roleLabels.push("Driver");

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
              <Badge key={role} variant="secondary" className="text-xs">{role}</Badge>
            ))}
          </div>
        </div>

        {/* Stats — admin only */}
        {!isDriverOnly && (
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
        )}

        {/* Quick links — admin only */}
        {!isDriverOnly && (
          <div className="space-y-2">
            {[
              { icon: Receipt, label: "Expenses", path: "/expenses" },
              { icon: Upload, label: "Pending Uploads", path: "/pending-uploads" },
            ].map(({ icon: Icon, label, path }) => (
              <Card key={path} className="cursor-pointer active:bg-muted/50" onClick={() => navigate(path)}>
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
        )}

        {adminLinks.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mb-2">
                Administration
              </p>
              {adminLinks.map(({ icon: Icon, label, path }) => (
                <Card key={path} className="cursor-pointer active:bg-muted/50 border-primary/20" onClick={() => navigate(path)}>
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

        {/* Driver profile: read-only for drivers, editable for admins */}
        {user?.roles?.includes("DRIVER") && user?.id && (
          isDriverOnly
            ? <DriverReadOnlyProfile userId={user.id} />
            : <DriverProfileForm userId={user.id} orgId={orgId} />
        )}

        <Separator />

        <Button
          variant="destructive"
          className="w-full min-h-[48px]"
          onClick={async () => { await logout(); navigate("/login"); }}
        >
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;
