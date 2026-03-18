/**
 * Phase 7 — Admin POD Review Page (/admin/pod-review)
 * Mobile-first closure workflow grouped by evidence gaps.
 *
 * Bands:
 *   1. Missing Inspection — delivery inspection not done
 *   2. Missing Signatures — inspection exists but signatures incomplete
 *   3. POD Ready — evidence complete, awaiting final sign-off
 *   4. Recently Completed (7d) — audit band
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UKPlate } from "@/components/UKPlate";
import { Skeleton } from "@/components/ui/skeleton";
import { getStatusStyle } from "@/lib/statusConfig";
import { usePodReviewData, type PodReviewRow } from "@/hooks/usePodReviewData";
import { supabase } from "@/integrations/supabase/client";
import { invalidateForEvent } from "@/lib/mutationEvents";
import { toast } from "@/hooks/use-toast";
import {
  Search, ClipboardList, PenTool, FileCheck, CheckCircle,
  Eye, FileText, MapPin, User, AlertTriangle, ChevronDown, ChevronUp, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BandFilter = "all" | "missing_inspection" | "missing_signatures" | "pod_ready" | "completed";

const FILTERS: { value: BandFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "missing_inspection", label: "No Inspection" },
  { value: "missing_signatures", label: "No Signatures" },
  { value: "pod_ready", label: "POD Ready" },
  { value: "completed", label: "Completed" },
];

/* ─── KPI Pill ─────────────────────────────────────────────────── */

function KpiPill({
  label, value, icon: Icon, variant, loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant: "default" | "warning" | "destructive" | "success";
  loading?: boolean;
}) {
  const colors = {
    default: "bg-card border-border text-foreground",
    warning: "bg-warning/5 border-warning/30 text-warning",
    destructive: "bg-destructive/5 border-destructive/30 text-destructive",
    success: "bg-primary/5 border-primary/30 text-primary",
  };

  return (
    <div className={cn("flex flex-col items-center gap-0.5 rounded-xl border p-2.5", colors[variant])}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {loading ? (
        <Skeleton className="h-5 w-6" />
      ) : (
        <span className="text-base font-semibold tabular-nums leading-tight">{value}</span>
      )}
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground truncate w-full text-center">
        {label}
      </span>
    </div>
  );
}

/* ─── Review Card ──────────────────────────────────────────────── */

function ReviewCard({ row, navigate, onConfirm, confirming }: {
  row: PodReviewRow;
  navigate: (path: string) => void;
  onConfirm: (id: string) => void;
  confirming: string | null;
}) {
  const s = getStatusStyle(row.status);
  const isConfirming = confirming === row.id;
  const canConfirm = ["pod_ready", "delivery_complete"].includes(row.status);

  return (
    <Card
      className="p-0 border border-border overflow-hidden cursor-pointer active:bg-muted/50 transition-colors"
      onClick={() => navigate(`/jobs/${row.id}`)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{ backgroundColor: s.backgroundColor, color: s.color }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-none shrink-0"
          >
            {s.label}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground truncate">
            {row.external_job_number || row.id.slice(0, 8)}
          </span>
        </div>
        <UKPlate reg={row.vehicle_reg} />
      </div>

      {/* Driver + Route */}
      <div className="px-3 pb-1.5 space-y-0.5">
        <span className="inline-flex items-center gap-1 text-[11px] text-foreground">
          <User className="h-3 w-3 text-muted-foreground" />
          {row.resolvedDriverName || <span className="text-warning font-medium">Unassigned</span>}
        </span>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {row.pickup_city || row.pickup_postcode} → {row.delivery_city || row.delivery_postcode}
          </span>
        </div>
      </div>

      {/* Evidence Cues */}
      <div className="px-3 pb-1.5 flex flex-wrap gap-1">
        {!row.has_delivery_inspection && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[9px] font-semibold">
            <AlertTriangle className="h-2.5 w-2.5" /> No Delivery Insp.
          </span>
        )}
        {!row.has_pickup_inspection && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 text-warning px-2 py-0.5 text-[9px] font-semibold">
            <AlertTriangle className="h-2.5 w-2.5" /> No Pickup Insp.
          </span>
        )}
        {row.has_delivery_inspection && !row.hasCustomerSignature && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 text-warning px-2 py-0.5 text-[9px] font-semibold">
            <PenTool className="h-2.5 w-2.5" /> No Customer Sig.
          </span>
        )}
        {row.has_delivery_inspection && !row.hasDriverSignature && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/10 text-warning px-2 py-0.5 text-[9px] font-semibold">
            <PenTool className="h-2.5 w-2.5" /> No Driver Sig.
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 pt-1 flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1 min-h-[40px] text-xs"
          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${row.id}/pod?from=pod-review`); }}
        >
          <FileText className="h-3.5 w-3.5 mr-1" /> Review POD
        </Button>
        {canConfirm && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-[40px] text-xs text-primary border-primary/30"
            disabled={isConfirming}
            onClick={(e) => { e.stopPropagation(); onConfirm(row.id); }}
          >
            {isConfirming ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
            Confirm
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[40px] text-xs"
          onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${row.id}?from=pod-review`); }}
        >
          <Eye className="h-3.5 w-3.5 mr-1" /> View
        </Button>
        {!row.has_delivery_inspection && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-[40px] text-xs text-warning border-warning/30"
            onClick={(e) => { e.stopPropagation(); navigate(`/inspection/${row.id}/delivery`); }}
          >
            <ClipboardList className="h-3.5 w-3.5 mr-1" /> Inspect
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ─── Queue Section ────────────────────────────────────────────── */

function QueueSection({
  title, icon: Icon, iconClass, rows, emptyText, navigate, collapsible, onConfirm, confirming,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  rows: PodReviewRow[];
  emptyText: string;
  navigate: (path: string) => void;
  collapsible?: boolean;
  onConfirm: (id: string) => void;
  confirming: string | null;
}) {
  const [collapsed, setCollapsed] = useState(!!collapsible);

  return (
    <section>
      <button
        type="button"
        className="flex items-center gap-2 mb-2 w-full text-left"
        onClick={() => collapsible && setCollapsed(!collapsed)}
      >
        <Icon className={cn("h-4 w-4", iconClass ?? "text-muted-foreground")} />
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        <span className="text-[11px] font-medium text-muted-foreground">({rows.length})</span>
        {collapsible && (
          <span className="ml-auto text-muted-foreground">
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {(!collapsible || !collapsed) && (
        <>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <ReviewCard key={row.id} row={row} navigate={navigate} onConfirm={onConfirm} confirming={confirming} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */

export function AdminPodReview() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = usePodReviewData();
  const [filter, setFilter] = useState<BandFilter>("all");
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const kpis = data?.kpis;
  const groups = data?.groups;

  const handleConfirmReview = async (jobId: string) => {
    setConfirming(jobId);
    try {
      const { error } = await supabase
        .from("jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() } as any)
        .eq("id", jobId);
      if (error) throw error;
      toast({ title: "Review confirmed — job completed" });
      invalidateForEvent(qc, "job_status_changed", [["job", jobId]]);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setConfirming(null);
    }
  };

  // Search helper
  const filterRows = (rows: PodReviewRow[]) => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.vehicle_reg?.toLowerCase().includes(s) ||
        r.external_job_number?.toLowerCase().includes(s) ||
        r.resolvedDriverName?.toLowerCase().includes(s) ||
        r.delivery_city?.toLowerCase().includes(s) ||
        r.delivery_postcode?.toLowerCase().includes(s)
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="POD Review" showBack onBack={() => navigate("/admin")} />

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* ── KPI STRIP ── */}
        <div className="grid grid-cols-4 gap-2">
          <KpiPill
            label="No Inspection"
            value={kpis?.missingInspection ?? 0}
            icon={ClipboardList}
            variant={(kpis?.missingInspection ?? 0) > 0 ? "destructive" : "default"}
            loading={isLoading}
          />
          <KpiPill
            label="No Signatures"
            value={kpis?.missingSignatures ?? 0}
            icon={PenTool}
            variant={(kpis?.missingSignatures ?? 0) > 0 ? "warning" : "default"}
            loading={isLoading}
          />
          <KpiPill
            label="POD Ready"
            value={kpis?.podReady ?? 0}
            icon={FileCheck}
            variant="default"
            loading={isLoading}
          />
          <KpiPill
            label="Completed"
            value={kpis?.recentlyCompleted ?? 0}
            icon={CheckCircle}
            variant="success"
            loading={isLoading}
          />
        </div>

        {/* ── SEARCH + FILTERS ── */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reg, driver, postcode…"
              className="pl-9 min-h-[44px] rounded-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? "default" : "outline"}
                size="sm"
                className="min-h-[36px] text-xs shrink-0 rounded-lg"
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* ── LOADING ── */}
        {isLoading && <DashboardSkeleton />}

        {/* ── ERROR ── */}
        {error && (
          <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20">
            <p className="text-sm text-destructive">
              Failed to load: {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        )}

        {/* ── QUEUE SECTIONS ── */}
        {groups && !isLoading && (
          <>
            {(filter === "all" || filter === "missing_inspection") && (
              <QueueSection
                title="Missing Inspection"
                icon={ClipboardList}
                iconClass="text-destructive"
                rows={filterRows(groups.missingInspection)}
                emptyText="All closure jobs have delivery inspections."
                navigate={navigate}
              />
            )}

            {(filter === "all" || filter === "missing_signatures") && (
              <QueueSection
                title="Missing Signatures"
                icon={PenTool}
                iconClass="text-warning"
                rows={filterRows(groups.missingSignatures)}
                emptyText="All inspected jobs have complete signatures."
                navigate={navigate}
              />
            )}

            {(filter === "all" || filter === "pod_ready") && (
              <QueueSection
                title="POD Ready"
                icon={FileCheck}
                iconClass="text-primary"
                rows={filterRows(groups.podReady)}
                emptyText="No jobs with complete evidence awaiting review."
                navigate={navigate}
              />
            )}

            {(filter === "all" || filter === "completed") && (
              <QueueSection
                title="Recently Completed (7d)"
                icon={CheckCircle}
                iconClass="text-primary"
                rows={filterRows(groups.recentlyCompleted)}
                emptyText="No recently completed jobs."
                navigate={navigate}
                collapsible
              />
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
