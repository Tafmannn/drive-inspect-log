import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle } from "lucide-react";

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
    <div className="min-h-screen bg-background">
      <AppHeader title="Sync Errors" showBack onBack={() => navigate("/admin")} />

      <div className="p-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !errors?.length ? (
          <div className="text-center py-12 space-y-2">
            <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No sync errors. All clear!</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Row</TableHead>
                  <TableHead className="text-xs">Sheet Job ID</TableHead>
                  <TableHead className="text-xs">Missing Fields</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map(err => (
                  <TableRow key={err.id}>
                    <TableCell className="font-mono text-xs">{err.sheet_row_index}</TableCell>
                    <TableCell className="text-xs">{err.sheet_job_id || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {err.missing_fields.map(f => (
                          <Badge key={f} variant="destructive" className="text-xs">{f}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(err.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
