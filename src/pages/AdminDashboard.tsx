/**
 * Phase 4 — Admin Dashboard
 * Intervention-first routing layer.
 * KPI Band → Attention Feed → Queue Previews → Quick Routes
 */

import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardCard } from "@/components/DashboardCard";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useAdminJobQueues, useAdminJobQueueKpis } from "@/hooks/useAdminJobQueues";
import { useAdminMissingEvidence } from "@/hooks/useAdminDashboardData";
import { AttentionCenter } from "@/features/attention/components/AttentionCenter";
import { AdminJobCard } from "@/components/AdminJobCard";
import {
  AlertTriangle, Users, Truck, Receipt, ClipboardCheck,
  ChevronRight, UserX, Clock, FileSearch, ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Intervention KPI Band ─────────────────────────────────────── */

interface KpiPillProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "warning" | "destructive";
  loading?: boolean;
  onClick?: () => void;
}

function KpiPill({ label, value, icon: Icon, variant = "default", loading, onClick }: KpiPillProps) {
  const colors = {
    default: "bg-card border-border text-foreground",
    warning: "bg-warning/5 border-warning/30 text-warning",
    destructive: "bg-destructive/5 border-destructive/30 text-destructive",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border p-3 min-w-0 flex-1 transition-colors active:bg-muted/50",
        colors[variant],
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {loading ? (
        <Skeleton className="h-6 w-8" />
      ) : (
        <span className="text-lg font-semibold tabular-nums leading-tight">{value}</span>
      )}
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate w-full text-center">
        {label}
      </span>
    </button>
  );
}

function InterventionKpis() {
  const navigate = useNavigate();
  const { data: kpis, isLoading } = useAdminJobQueueKpis();
  const { data: missingEvidence, isLoading: evidenceLoading } = useAdminMissingEvidence();

  return (
    <div className="grid grid-cols-4 gap-2">
      <KpiPill
        label="Unassigned"
        value={kpis?.unassigned ?? 0}
        icon={UserX}
        variant={(kpis?.unassigned ?? 0) > 0 ? "destructive" : "default"}
        loading={isLoading}
        onClick={() => navigate("/admin/jobs")}
      />
      <KpiPill
        label="Stale"
        value={kpis?.stale ?? 0}
        icon={Clock}
        variant={(kpis?.stale ?? 0) > 0 ? "warning" : "default"}
        loading={isLoading}
        onClick={() => navigate("/admin/jobs")}
      />
      <KpiPill
        label="POD Review"
        value={kpis?.podReview ?? 0}
        icon={FileSearch}
        variant={(kpis?.podReview ?? 0) > 0 ? "warning" : "default"}
        loading={isLoading}
        onClick={() => navigate("/admin/jobs")}
      />
      <KpiPill
        label="No Evidence"
        value={missingEvidence ?? 0}
        icon={ImageOff}
        variant={(missingEvidence ?? 0) > 0 ? "destructive" : "default"}
        loading={evidenceLoading}
        onClick={() => navigate("/admin/jobs")}
      />
    </div>
  );
}

/* ─── Queue Preview ────────────────────────────────────────────── */

function QueuePreview({
  title,
  items,
  loading,
  emptyText,
  onViewAll,
}: {
  title: string;
  items: any[];
  loading: boolean;
  emptyText: string;
  onViewAll: () => void;
}) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs text-muted-foreground h-7 gap-1">
          View all <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">{emptyText}</p>
      ) : (
        items.slice(0, 3).map(job => (
          <AdminJobCard
            key={job.id}
            job={job}
            onView={() => navigate(`/jobs/${job.id}`)}
            onAssign={() => {}}
          />
        ))
      )}
    </section>
  );
}

/* ─── Quick Routes ─────────────────────────────────────────────── */

function QuickRoutes() {
  const navigate = useNavigate();

  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground mb-2">Quick Access</h3>
      <div className="grid grid-cols-2 gap-3">
        <DashboardCard
          icon={<Truck className="w-5 h-5 stroke-[2]" />}
          title="Jobs Queue"
          subtitle="Manage all jobs"
          onClick={() => navigate("/admin/jobs")}
        />
        <DashboardCard
          icon={<Users className="w-5 h-5 stroke-[2]" />}
          title="Drivers"
          subtitle="Fleet & workload"
          onClick={() => navigate("/admin/users")}
        />
        <DashboardCard
          icon={<Receipt className="w-5 h-5 stroke-[2]" />}
          title="Finance"
          subtitle="Expenses & invoices"
          onClick={() => navigate("/expenses")}
        />
        <DashboardCard
          icon={<ClipboardCheck className="w-5 h-5 stroke-[2]" />}
          title="POD Review"
          subtitle="Closure workflow"
          onClick={() => navigate("/admin/jobs")}
        />
      </div>
    </section>
  );
}

/* ─── Main Dashboard ───────────────────────────────────────────── */

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { data: queues, isLoading } = useAdminJobQueues();

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <AppHeader title="Access Denied" showBack onBack={() => navigate("/")} />
        <p className="text-center py-12 text-sm text-muted-foreground">You do not have permission to access this page.</p>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Admin Dashboard" showBack onBack={() => navigate("/")} />

      <div className="p-4 max-w-lg mx-auto space-y-5">
        {/* 1. Intervention KPI Band */}
        <InterventionKpis />

        <Separator />

        {/* 2. Attention Feed (top issues) */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Attention Required
          </h3>
          <AttentionCenter scope="org" />
        </section>

        <Separator />

        {/* 3. Queue Previews */}
        <QueuePreview
          title="Unassigned Jobs"
          items={queues?.unassigned ?? []}
          loading={isLoading}
          emptyText="All jobs are assigned."
          onViewAll={() => navigate("/admin/jobs")}
        />

        <QueuePreview
          title="In Progress"
          items={queues?.inProgress ?? []}
          loading={isLoading}
          emptyText="No jobs in progress."
          onViewAll={() => navigate("/admin/jobs")}
        />

        <Separator />

        {/* 4. Quick Routes */}
        <QuickRoutes />
      </div>

      <BottomNav />
    </div>
  );
};
