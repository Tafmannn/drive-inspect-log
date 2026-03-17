/**
 * Phase 8 — Super Admin Overview
 * Platform governance surface: KPI band → Recent Audit → Quick Routes to detail pages.
 *
 * Detail management (Orgs, Users, Jobs, Audit, Errors, Settings) lives
 * in dedicated sub-pages at /super-admin/:tab to keep this overview lean.
 */

import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardCard } from "@/components/DashboardCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  useSuperAdminKpis,
  useRecentAuditLogs,
} from "@/features/control/hooks/useSuperAdminControlData";
import {
  Building2, Users, Truck, ScrollText, AlertCircle,
  UserPlus, Settings, ChevronRight, Shield, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── KPI Pill ─────────────────────────────────────────────────── */

function KpiPill({
  label, value, icon: Icon, variant = "default", loading, onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "info" | "warning" | "destructive";
  loading?: boolean;
  onClick?: () => void;
}) {
  const colors = {
    default: "bg-card border-border text-foreground",
    info: "bg-primary/5 border-primary/30 text-primary",
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

/* ─── Governance KPIs ──────────────────────────────────────────── */

function GovernanceKpis() {
  const navigate = useNavigate();
  const { data: kpis, isLoading } = useSuperAdminKpis();

  return (
    <div className="grid grid-cols-2 gap-2">
      <KpiPill
        label="Organisations"
        value={kpis?.totalOrgs ?? 0}
        icon={Building2}
        loading={isLoading}
        onClick={() => navigate("/super-admin/orgs")}
      />
      <KpiPill
        label="Users"
        value={kpis?.totalUsers ?? 0}
        icon={Users}
        loading={isLoading}
        onClick={() => navigate("/super-admin/users")}
      />
      <KpiPill
        label="Active Jobs"
        value={kpis?.activeJobs ?? 0}
        icon={Truck}
        variant="info"
        loading={isLoading}
        onClick={() => navigate("/super-admin/jobs")}
      />
      <KpiPill
        label="Audit Today"
        value={kpis?.auditEventsToday ?? 0}
        icon={ScrollText}
        variant={(kpis?.auditEventsToday ?? 0) > 0 ? "warning" : "default"}
        loading={isLoading}
        onClick={() => navigate("/super-admin/audit")}
      />
    </div>
  );
}

/* ─── Recent Audit Feed ────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RecentAuditFeed() {
  const navigate = useNavigate();
  const { data: logs, isLoading } = useRecentAuditLogs();

  if (isLoading) {
    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <ScrollText className="h-4 w-4 text-muted-foreground" /> Recent Audit
          </h3>
        </div>
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </section>
    );
  }

  const recent = (logs ?? []).slice(0, 5);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <ScrollText className="h-4 w-4 text-muted-foreground" /> Recent Audit
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/super-admin/audit")}
          className="text-xs text-muted-foreground h-7 gap-1"
        >
          View all <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      {recent.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No audit events yet.</p>
      ) : (
        <div className="space-y-1.5">
          {recent.map((log: any) => (
            <Card key={log.id} className="p-0 border border-border">
              <CardContent className="px-3 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="text-[10px] font-mono uppercase shrink-0">
                      {log.action}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(log.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {log.performed_by_email}
                    {log.after_state && (
                      <> — <span className="text-foreground/70">{JSON.stringify(log.after_state).slice(0, 50)}</span></>
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── Quick Routes ─────────────────────────────────────────────── */

function QuickRoutes() {
  const navigate = useNavigate();

  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground mb-2">Platform Management</h3>
      <div className="grid grid-cols-2 gap-3">
        <DashboardCard
          icon={<Building2 className="w-5 h-5 stroke-[2]" />}
          title="Organisations"
          subtitle="Create & manage tenants"
          onClick={() => navigate("/super-admin/orgs")}
        />
        <DashboardCard
          icon={<UserPlus className="w-5 h-5 stroke-[2]" />}
          title="Users"
          subtitle="Roles & access"
          onClick={() => navigate("/super-admin/users")}
        />
        <DashboardCard
          icon={<Briefcase className="w-5 h-5 stroke-[2]" />}
          title="Jobs Monitor"
          subtitle="All platform jobs"
          onClick={() => navigate("/super-admin/jobs")}
        />
        <DashboardCard
          icon={<AlertCircle className="w-5 h-5 stroke-[2]" />}
          title="Errors"
          subtitle="System error feed"
          onClick={() => navigate("/super-admin/errors")}
        />
        <DashboardCard
          icon={<Shield className="w-5 h-5 stroke-[2]" />}
          title="Attention"
          subtitle="Global exceptions"
          onClick={() => navigate("/super-admin/attention")}
        />
        <DashboardCard
          icon={<Settings className="w-5 h-5 stroke-[2]" />}
          title="Settings"
          subtitle="Feature flags & config"
          onClick={() => navigate("/super-admin/settings")}
        />
      </div>
    </section>
  );
}

/* ─── Main Overview ────────────────────────────────────────────── */

export function SuperAdminDashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Super Admin" showBack onBack={() => navigate("/")} />

      <div className="p-4 max-w-lg mx-auto space-y-5">
        {/* 1. Governance KPIs */}
        <GovernanceKpis />

        <Separator />

        {/* 2. Recent Audit Feed */}
        <RecentAuditFeed />

        <Separator />

        {/* 3. Quick Routes */}
        <QuickRoutes />
      </div>

      <BottomNav />
    </div>
  );
}
