import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet, RefreshCw, Upload, Download, CheckCircle, XCircle,
  AlertTriangle, Loader2, Link2, Unlink
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as syncApi from "@/lib/sheetSyncApi";

const COLUMN_MAP = [
  { col: "A", header: "Job ID", direction: "anchor" },
  { col: "B", header: "Job Date", direction: "app_to_sheet" },
  { col: "C", header: "Job Status", direction: "bidirectional" },
  { col: "D", header: "Job Priority", direction: "app_to_sheet" },
  { col: "E", header: "Job Type", direction: "app_to_sheet" },
  { col: "F", header: "Client Name", direction: "app_to_sheet" },
  { col: "G-R", header: "Pickup / Delivery Fields", direction: "app_to_sheet" },
  { col: "AB-AG", header: "Vehicle Fields", direction: "app_to_sheet" },
  { col: "AH-AK", header: "Distance / Rate / Price", direction: "sheet_to_app" },
  { col: "AN", header: "Driver Name", direction: "app_to_sheet" },
  { col: "AR", header: "Sync to App?", direction: "sheet_to_app" },
  { col: "AS", header: "App Job ID", direction: "app_to_sheet" },
];

function directionBadge(dir: string) {
  switch (dir) {
    case "app_to_sheet": return <Badge variant="outline" className="text-xs bg-primary/10">App → Sheet</Badge>;
    case "sheet_to_app": return <Badge variant="outline" className="text-xs bg-warning/10 text-warning">Sheet → App</Badge>;
    case "bidirectional": return <Badge variant="outline" className="text-xs bg-success/10 text-success">↔ Both</Badge>;
    case "sheet_only": return <Badge variant="outline" className="text-xs bg-muted">Sheet Only</Badge>;
    case "anchor": return <Badge variant="secondary" className="text-xs">Anchor</Badge>;
    default: return <Badge variant="outline" className="text-xs">{dir}</Badge>;
  }
}

export function GoogleSheetsPanel() {
  const qc = useQueryClient();
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("Job Master");

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["sheet-sync-config"],
    queryFn: syncApi.getSheetSyncConfig,
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["sheet-sync-logs"],
    queryFn: () => syncApi.getSyncLogs(15),
  });

  const saveCfg = useMutation({
    mutationFn: () =>
      syncApi.upsertSheetSyncConfig({
        spreadsheet_id: spreadsheetId || config?.spreadsheet_id || "",
        sheet_name: sheetName || config?.sheet_name || "Jobs",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sheet-sync-config"] });
      toast({ title: "Saved", description: "Sheet configuration updated." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleEnabled = useMutation({
    mutationFn: () =>
      syncApi.upsertSheetSyncConfig({
        spreadsheet_id: config?.spreadsheet_id || "",
        sheet_name: config?.sheet_name || "Jobs",
        is_enabled: !config?.is_enabled,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sheet-sync-config"] });
      toast({ title: config?.is_enabled ? "Sync disabled" : "Sync enabled" });
    },
  });

  const testConn = useMutation({
    mutationFn: syncApi.testSheetConnection,
    onSuccess: (data) => {
      toast({ title: "Connection OK", description: `Headers: ${data.headers?.join(", ")}` });
    },
    onError: (e: Error) => toast({ title: "Connection failed", description: e.message, variant: "destructive" }),
  });

  const pushSync = useMutation({
    mutationFn: () => syncApi.pushToSheet(),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["sheet-sync-logs", "sheet-sync-config"] });
      toast({
        title: "Push complete",
        description: `${data.rows_created} created, ${data.rows_updated} updated, ${data.rows_skipped} skipped`,
      });
    },
    onError: (e: Error) => toast({ title: "Push failed", description: e.message, variant: "destructive" }),
  });

  const pullSync = useMutation({
    mutationFn: syncApi.pullFromSheet,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["sheet-sync-logs"] });
      qc.invalidateQueries({ queryKey: ["sheet-sync-config"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
      const parts: string[] = [];
      if (data.rows_created > 0) parts.push(`${data.rows_created} new jobs imported`);
      if (data.rows_updated > 0) parts.push(`${data.rows_updated} updated`);
      if (data.rows_skipped > 0) parts.push(`${data.rows_skipped} skipped`);
      if (data.errors?.length > 0) parts.push(`${data.errors.length} errors`);
      const desc = parts.length > 0 ? parts.join(", ") : (data.message || "No eligible rows found");
      toast({
        title: data.rows_created > 0 ? `${data.rows_created} new jobs imported from Job Entry` : "Pull complete",
        description: desc,
        variant: data.errors?.length > 0 ? "destructive" : "default",
      });
    },
    onError: (e: Error) => toast({ title: "Pull failed", description: e.message, variant: "destructive" }),
  });

  const isSyncing = pushSync.isPending || pullSync.isPending;

  const setupTab = useMutation({
    mutationFn: syncApi.setupJobMasterTab,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["sheet-sync-config"] });
      toast({ title: "Job Master tab created", description: data.message });
    },
    onError: (e: Error) => toast({ title: "Setup failed", description: e.message, variant: "destructive" }),
  });

  if (configLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Connection Config */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sheet className="h-5 w-5 text-primary" />
          <h4 className="font-semibold text-sm">Google Sheet Connection</h4>
          {config && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{config.is_enabled ? "Enabled" : "Disabled"}</span>
              <Switch checked={config.is_enabled} onCheckedChange={() => toggleEnabled.mutate()} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Spreadsheet ID</Label>
            <Input
              placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              value={spreadsheetId || config?.spreadsheet_id || ""}
              onChange={(e) => setSpreadsheetId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sheet (tab) name</Label>
            <Input
              placeholder="Job Master"
              value={sheetName || config?.sheet_name || ""}
              onChange={(e) => setSheetName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={() => saveCfg.mutate()} disabled={saveCfg.isPending}>
            {saveCfg.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Link2 className="h-4 w-4 mr-1" />}
            Save Config
          </Button>
          <Button size="sm" variant="outline" onClick={() => testConn.mutate()} disabled={testConn.isPending || !config}>
            {testConn.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Test Connection
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setupTab.mutate()} disabled={setupTab.isPending || !config}>
            {setupTab.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sheet className="h-4 w-4 mr-1" />}
            Create Job Master Tab
          </Button>
        </div>

        {config?.last_push_at && (
          <p className="text-xs text-muted-foreground">Last push: {new Date(config.last_push_at).toLocaleString()}</p>
        )}
        {config?.last_pull_at && (
          <p className="text-xs text-muted-foreground">Last pull: {new Date(config.last_pull_at).toLocaleString()}</p>
        )}
      </Card>

      {/* Sync Actions */}
      {config && (
        <Card className="p-4 space-y-3">
          <h4 className="font-semibold text-sm">Sync Actions</h4>
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => pushSync.mutate()} disabled={isSyncing || !config.is_enabled}>
              {pushSync.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Push Jobs → Sheet
            </Button>
            <Button variant="outline" onClick={() => pullSync.mutate()} disabled={isSyncing || !config.is_enabled}>
              {pullSync.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
              Pull Sheet → App
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Push sends all app jobs to Job Master. Pull imports new jobs from the Job Entry tab and syncs them to Job Master.
          </p>
        </Card>
      )}

      {/* Column Mapping */}
      <Card className="p-4 space-y-3">
        <h4 className="font-semibold text-sm">Column Mapping</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Col</TableHead>
                <TableHead>Header</TableHead>
                <TableHead>Direction</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COLUMN_MAP.map((c) => (
                <TableRow key={c.col}>
                  <TableCell className="font-mono font-bold">{c.col}</TableCell>
                  <TableCell>{c.header}</TableCell>
                  <TableCell>{directionBadge(c.direction)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Sync Logs */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">Sync Logs</h4>
          <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["sheet-sync-logs"] })}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {logsLoading ? (
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        ) : !logs?.length ? (
          <p className="text-xs text-muted-foreground text-center py-4">No sync logs yet.</p>
        ) : (
          <div className="overflow-x-auto max-h-60 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Dir</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Rows</TableHead>
                  <TableHead className="text-xs">Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell>
                      {log.direction === "push" ? (
                        <Badge variant="outline" className="text-xs">Push</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Pull</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.status === "success" && <CheckCircle className="h-4 w-4 text-primary" />}
                      {log.status === "partial" && <AlertTriangle className="h-4 w-4 text-warning" />}
                      {log.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.rows_created}↑ {log.rows_updated}↻ {log.rows_skipped}–
                    </TableCell>
                    <TableCell className="text-xs text-destructive">
                      {log.errors?.length ? log.errors.length : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
