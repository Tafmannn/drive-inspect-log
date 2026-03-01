import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle } from "lucide-react";

interface SyncError {
  id: string;
  sheet_row_index: number;
  sheet_job_id: string | null;
  missing_fields: string[];
  error_message: string | null;
  resolved: boolean;
  created_at: string;
}

export function SyncErrors() {
  const navigate = useNavigate();

  const { data: errors, isLoading } = useQuery({
    queryKey: ["sync-errors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_errors")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as SyncError[];
    },
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Sync Errors" showBack onBack={() => navigate("/admin")} />

      <div className="p-4 max-w-2xl mx-auto">
        {isLoading ? (
          <DashboardSkeleton />
        ) : !errors?.length ? (
          <div className="text-center py-12 space-y-2">
            <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto stroke-[2]" />
            <p className="text-[14px] text-muted-foreground">No sync errors. All clear!</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[13px]">Row</TableHead>
                  <TableHead className="text-[13px]">Sheet Job ID</TableHead>
                  <TableHead className="text-[13px]">Missing Fields</TableHead>
                  <TableHead className="text-[13px]">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map(err => (
                  <TableRow key={err.id}>
                    <TableCell className="font-mono text-[13px]">{err.sheet_row_index}</TableCell>
                    <TableCell className="text-[13px]">{err.sheet_job_id || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {err.missing_fields.map(f => (
                          <Badge key={f} variant="destructive" className="text-[13px]">{f}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px] whitespace-nowrap">
                      {new Date(err.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
