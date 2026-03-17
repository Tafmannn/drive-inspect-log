/**
 * UserStatusBadge — renders account_status and archived state as styled badges.
 */
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldAlert, ShieldOff, Archive } from "lucide-react";

const statusConfig = {
  active: { label: "Active", icon: Shield, variant: "default" as const, className: "bg-emerald-600/15 text-emerald-700 border-emerald-600/20 hover:bg-emerald-600/20" },
  pending_activation: { label: "Pending", icon: ShieldAlert, variant: "outline" as const, className: "bg-amber-500/15 text-amber-700 border-amber-500/20 hover:bg-amber-500/20" },
  suspended: { label: "Suspended", icon: ShieldOff, variant: "destructive" as const, className: "bg-destructive/15 text-destructive border-destructive/20 hover:bg-destructive/20" },
};

export function AccountStatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.pending_activation;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-0.5 font-medium ${cfg.className}`}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </Badge>
  );
}

export function ArchivedBadge() {
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 font-medium bg-muted text-muted-foreground border-border">
      <Archive className="h-2.5 w-2.5" />
      Archived
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const label = role === "super_admin" ? "Super Admin" : role === "admin" ? "Admin" : "Driver";
  const className = role === "super_admin"
    ? "bg-violet-600/15 text-violet-700 border-violet-600/20"
    : role === "admin"
      ? "bg-blue-600/15 text-blue-700 border-blue-600/20"
      : "bg-muted text-muted-foreground border-border";
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium ${className}`}>
      {label}
    </Badge>
  );
}
