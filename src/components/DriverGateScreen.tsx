/**
 * Holding screens for drivers who aren't yet fully active.
 * No BottomNav — gated drivers should not navigate freely.
 */
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ShieldX, UserX, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import type { DriverGateStatus } from "@/hooks/useDriverGate";

const STATUS_CONFIG: Record<Exclude<DriverGateStatus, "loading" | "active" | "ungated">, {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge: string;
  badgeVariant: "secondary" | "destructive" | "outline";
}> = {
  no_profile: {
    icon: <UserX className="w-12 h-12 text-muted-foreground" />,
    title: "Account Being Set Up",
    subtitle: "Your admin is preparing your driver profile. You'll be able to access your jobs once your account is ready.",
    badge: "Awaiting Setup",
    badgeVariant: "outline",
  },
  onboarding: {
    icon: <Clock className="w-12 h-12 text-warning" />,
    title: "Awaiting Activation",
    subtitle: "Your account is being reviewed by the Axentra admin team. You'll receive access to your jobs once onboarding is approved.",
    badge: "Under Review",
    badgeVariant: "secondary",
  },
  rejected: {
    icon: <ShieldX className="w-12 h-12 text-destructive" />,
    title: "Account Not Active",
    subtitle: "Your onboarding was not approved. Please contact your administrator for more information.",
    badge: "Inactive",
    badgeVariant: "destructive",
  },
};

export function DriverGateScreen({ gateStatus }: { gateStatus: Exclude<DriverGateStatus, "loading" | "active" | "ungated"> }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const config = STATUS_CONFIG[gateStatus];

  return (
    <div className="min-h-screen bg-background pb-6">
      <AppHeader title="Dashboard" />

      <div className="p-4 max-w-lg mx-auto space-y-6">
        <Card>
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            {config.icon}
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{config.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{config.subtitle}</p>
            </div>
            <Badge variant={config.badgeVariant} className="text-xs">
              {config.badge}
            </Badge>
          </CardContent>
        </Card>

        {user && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </CardContent>
          </Card>
        )}

        <Button
          variant="destructive"
          className="w-full min-h-[48px]"
          onClick={async () => { await logout(); navigate("/login"); }}
        >
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </div>

    </div>
  );
}
