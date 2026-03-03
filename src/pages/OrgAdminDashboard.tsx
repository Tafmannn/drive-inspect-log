import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { getOrgUsers } from "@/lib/adminApi";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Briefcase, ClipboardCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function OrgAdminDashboard() {
  const { isSuperAdmin, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [driverCount, setDriverCount] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [inspectionCount, setInspectionCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      // Get driver count from edge function
      const users = await getOrgUsers();
      setDriverCount(users.filter((u) => u.role === "driver").length);

      // Get job count
      const { count: jCount } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true });
      setJobCount(jCount ?? 0);

      // Get inspection count
      const { count: iCount } = await supabase
        .from("inspections")
        .select("id", { count: "exact", head: true });
      setInspectionCount(iCount ?? 0);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin || isAdmin) fetchStats();
  }, [isSuperAdmin, isAdmin, fetchStats]);

  if (!isSuperAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Access denied</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Organisation Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Drivers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{driverCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Jobs</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inspections</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inspectionCount}</div>
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={() => navigate("/admin/users")}>
        Manage Users
      </Button>
    </div>
  );
}
