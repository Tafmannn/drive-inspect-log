/**
 * SQL-first Exports page.
 * Mounted at /control/exports (admin / super-admin only via ControlRoute).
 */

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useControlNavigation } from "@/features/control/hooks/useControlNavigation";
import { ControlPageContainer } from "@/features/control/components/ControlPageContainer";
import { ControlPageHeader } from "@/features/control/components/ControlPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileDown, Database, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  exportJobsCsvSql,
  exportInspectionsCsvSql,
  exportExpensesCsvSql,
  type ExportFilters,
} from "../api/exportQueries";
import { exportJsonBackup } from "../api/jsonBackup";

type ExportKind = "jobs" | "inspections" | "expenses" | "backup";

export function ExportsPage() {
  // Touch nav so the active sidebar entry highlights correctly.
  useControlNavigation();
  const { isSuperAdmin } = useAuth();

  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [filters, setFilters] = useState<ExportFilters>({
    dateFrom: undefined,
    dateTo: undefined,
  });

  async function run(kind: ExportKind) {
    setBusy(kind);
    try {
      let count = 0;
      if (kind === "jobs") count = await exportJobsCsvSql(filters);
      else if (kind === "inspections") count = await exportInspectionsCsvSql(filters);
      else if (kind === "expenses") count = await exportExpensesCsvSql(filters);
      else {
        const res = await exportJsonBackup();
        count = Object.values(res.counts).reduce((a, b) => a + b, 0);
      }
      toast({
        title: "Export ready",
        description: `${count.toLocaleString()} record${count === 1 ? "" : "s"} downloaded.`,
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ControlPageContainer>
      <ControlPageHeader
        title="Exports"
        subtitle={
          isSuperAdmin
            ? "Cross-org SQL exports. Date filters apply to created_at (jobs/inspections) or date (expenses)."
            : "Org-scoped SQL exports. Date filters apply to created_at (jobs/inspections) or date (expenses)."
        }
      />

      {/* Date filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Optional. Leave blank for all-time exports.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Export tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ExportCard
          title="Jobs CSV"
          description="All job records with vehicle, addresses, driver, pricing."
          busy={busy === "jobs"}
          onClick={() => run("jobs")}
        />
        <ExportCard
          title="Inspections CSV"
          description="Pickup & delivery inspection records with condition flags."
          busy={busy === "inspections"}
          onClick={() => run("inspections")}
        />
        <ExportCard
          title="Expenses CSV"
          description="All expense entries with category, amount, billable flags."
          busy={busy === "expenses"}
          onClick={() => run("expenses")}
        />
      </div>

      {/* Full backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-4 h-4" /> Full JSON Backup
          </CardTitle>
          <CardDescription>
            Single JSON file containing jobs, inspections, photos, expenses, invoices, clients,
            and damage items. Use for archival or migration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => run("backup")} disabled={busy !== null}>
            {busy === "backup" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Building backup…
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" /> Download JSON Backup
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </ControlPageContainer>
  );
}

function ExportCard({
  title,
  description,
  busy,
  onClick,
}: {
  title: string;
  description: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <Button variant="outline" className="w-full" onClick={onClick} disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting…
            </>
          ) : (
            <>
              <FileDown className="w-4 h-4 mr-2" /> Download CSV
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
