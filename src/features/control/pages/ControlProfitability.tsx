/**
 * Profitability Control Page — /control/profitability
 * Revenue, logged cost and margin per completed job.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { StatusChip } from "../components/shared/StatusChip";
import { FilterBar } from "../components/shared/FilterBar";
import {
  useProfitabilityData,
  PROFITABILITY_PERIODS,
  DEFAULT_PROFITABILITY_PERIOD,
  type ProfitabilityPeriod,
  type ProfitabilityRow,
} from "../hooks/useControlProfitabilityData";
import { formatGbp } from "../lib/financeBreakdown";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, PoundSterling, Receipt, AlertTriangle } from "lucide-react";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

export function ControlProfitability() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<ProfitabilityPeriod>(DEFAULT_PROFITABILITY_PERIOD);
  const { data, isLoading } = useProfitabilityData(period);

  const kpiItems = [
    { label: "Jobs", value: data?.kpis.jobCount, icon: Receipt, variant: "default" as const, loading: isLoading },
    { label: "Revenue", value: data ? formatGbp(data.kpis.totalRevenue) : undefined, icon: PoundSterling, variant: "info" as const, loading: isLoading },
    { label: "Logged Cost", value: data ? formatGbp(data.kpis.totalCost) : undefined, icon: PoundSterling, variant: "default" as const, loading: isLoading },
    {
      label: "Net Margin",
      value: data ? formatGbp(data.kpis.netMargin) : undefined,
      icon: data && data.kpis.netMargin < 0 ? TrendingDown : TrendingUp,
      variant: data && data.kpis.netMargin < 0 ? ("destructive" as const) : ("success" as const),
      loading: isLoading,
    },
    {
      label: "Incomplete Cost Data",
      value: data?.kpis.jobsWithIncompleteCost,
      icon: AlertTriangle,
      variant: data?.kpis.jobsWithIncompleteCost ? ("warning" as const) : ("default" as const),
      loading: isLoading,
    },
  ];

  const columns: CompactColumn<ProfitabilityRow>[] = [
    {
      key: "date",
      header: "Completed",
      className: "w-[90px]",
      render: (r) => <span className="text-xs text-foreground">{shortDate(r.completedAt)}</span>,
    },
    {
      key: "job",
      header: "Job",
      className: "w-[110px]",
      render: (r) => (
        <button
          className="text-xs text-primary hover:underline truncate block max-w-[110px]"
          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${r.jobId}?from=/control/profitability`); }}
        >
          {r.jobNumber || r.vehicleReg}
        </button>
      ),
    },
    {
      key: "client",
      header: "Client",
      render: (r) => <span className="text-xs text-foreground truncate block max-w-[140px]">{r.clientName || "—"}</span>,
    },
    {
      key: "driver",
      header: "Driver",
      render: (r) => <span className="text-xs text-muted-foreground truncate block max-w-[120px]">{r.driverName || "—"}</span>,
    },
    {
      key: "revenue",
      header: "Revenue",
      className: "w-[85px] text-right",
      render: (r) => <span className="text-xs tabular-nums text-foreground">{formatGbp(r.revenue)}</span>,
    },
    {
      key: "cost",
      header: "Cost",
      className: "w-[85px] text-right",
      render: (r) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatGbp(r.cost)}{r.costIncomplete ? "*" : ""}
        </span>
      ),
    },
    {
      key: "margin",
      header: "Margin",
      className: "w-[90px] text-right",
      render: (r) => (
        <span className={`text-xs font-semibold tabular-nums ${r.margin < 0 ? "text-destructive" : "text-foreground"}`}>
          {formatGbp(r.margin)}
        </span>
      ),
    },
    {
      key: "marginPct",
      header: "Margin %",
      className: "w-[80px] text-right",
      render: (r) =>
        r.marginPct == null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <StatusChip
            label={`${r.marginPct.toFixed(0)}%`}
            variant={r.marginPct < 0 ? "destructive" : r.marginPct < 15 ? "warning" : "success"}
            className="text-[9px]"
          />
        ),
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Profitability"
        subtitle="Revenue, logged cost and margin for completed jobs — sorted worst margin first"
      />

      <KpiStrip items={kpiItems} className="grid-cols-2 lg:grid-cols-5" />

      <FilterBar>
        {PROFITABILITY_PERIODS.map((opt) => (
          <Button
            key={opt.value}
            variant={period === opt.value ? "default" : "outline"}
            size="sm"
            className="text-xs h-8"
            onClick={() => setPeriod(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </FilterBar>

      <ControlSection
        title="Jobs"
        description={`${data?.rows.length ?? 0} completed jobs · * = cost is partial (no driver pay rate set, or basis not yet supported)`}
        flush
      >
        <CompactTable
          columns={columns}
          data={data?.rows ?? []}
          loading={isLoading}
          emptyMessage="No completed jobs in this period."
          onRowClick={(row) => navigate(`/jobs/${row.jobId}?from=/control/profitability`)}
        />
      </ControlSection>
    </ControlShell>
  );
}
