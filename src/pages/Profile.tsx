import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { User, Receipt, Upload, Download, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Profile = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [expenseTotal, setExpenseTotal] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { count } = await supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("is_hidden", false);
        setJobCount(count ?? 0);
      } catch { setJobCount(null); }
    })();
    (async () => {
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { data } = await supabase
          .from("expenses")
          .select("amount")
          .eq("is_hidden", false)
          .gte("date", monthStart);
        if (data) {
          const total = data.reduce((s, e) => s + (e.amount ?? 0), 0);
          setExpenseTotal(`£${total.toFixed(2)}`);
        }
      } catch { setExpenseTotal(null); }
    })();
  }, []);

  const roleLabels: string[] = [];
  if (isSuperAdmin) roleLabels.push("Super Admin");
  else if (isAdmin) roleLabels.push("Admin");
  if (user.roles.includes("DRIVER")) roleLabels.push("Driver");

  const shortcuts = [
    { icon: Receipt, label: "Expenses", path: "/expenses" },
    { icon: Upload, label: "Pending Uploads", path: "/pending-uploads" },
    { icon: Download, label: "Download Jobs", path: "/jobs" },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Profile" />

      <div className="px-4 py-6 space-y-6 max-w-lg mx-auto">
        {/* Avatar + Identity */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <p className="text-lg font-semibold text-foreground">{user.name || "Unknown user"}</p>
          <p className="text-sm text-muted-foreground">{user.email || "No email set"}</p>
          <div className="flex gap-1.5 mt-1">
            {roleLabels.map((r) => (
              <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
            ))}
          </div>
        </div>

        <Separator />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{jobCount ?? "–"}</p>
              <p className="text-xs text-muted-foreground">Total Jobs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{expenseTotal ?? "–"}</p>
              <p className="text-xs text-muted-foreground">This Month</p>
            </CardContent>
          </Card>
        </div>

        {/* Shortcuts */}
        <div className="space-y-2">
          {shortcuts.map(({ icon: Icon, label, path }) => (
            <Card
              key={path}
              className="cursor-pointer active:bg-muted/50 transition-colors"
              onClick={() => navigate(path)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">{label}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        <Separator />

        {/* Sign out */}
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => {
            // TODO: wire to real logout when auth is enabled
            navigate("/");
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
