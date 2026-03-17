/**
 * Assign Driver Modal — compact driver picker for dispatch workflows.
 * COMPLIANCE ENFORCEMENT: Checks onboarding eligibility before assignment.
 * Uses domain event invalidation for mutation coherence.
 */
import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateForEvent } from "@/lib/mutationEvents";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, UserCheck, X, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { OnboardingRecord } from "@/lib/onboardingApi";

interface AssignDriverModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobRef: string;
  currentDriverId?: string | null;
}

interface DriverOption {
  id: string;
  user_id: string;
  full_name: string;
  display_name: string | null;
  phone: string | null;
  is_active: boolean;
  trade_plate_number: string | null;
  licence_expiry: string | null;
}

interface DriverEligibility {
  eligible: boolean;
  reason?: string;
}

function checkDriverEligibility(
  driver: DriverOption,
  onboardingMap: Map<string, OnboardingRecord>,
): DriverEligibility {
  const today = new Date().toISOString().slice(0, 10);

  // Check licence expiry
  if (driver.licence_expiry && driver.licence_expiry < today) {
    return { eligible: false, reason: "Licence expired" };
  }

  // Check onboarding record if exists
  const onboarding = onboardingMap.get(driver.user_id);
  if (onboarding) {
    if (onboarding.status === "rejected") {
      return { eligible: false, reason: "Onboarding rejected" };
    }
    if (onboarding.status === "pending_review") {
      return { eligible: false, reason: "Pending review" };
    }
    if (onboarding.status === "draft") {
      return { eligible: false, reason: "Onboarding incomplete" };
    }
  }

  return { eligible: true };
}

export function AssignDriverModal({
  open,
  onOpenChange,
  jobId,
  jobRef,
  currentDriverId,
}: AssignDriverModalProps) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: drivers, isLoading: driversLoading } = useQuery({
    queryKey: ["assign-driver-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_profiles")
        .select("id, user_id, full_name, display_name, phone, is_active, trade_plate_number, licence_expiry, archived_at")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("full_name", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as DriverOption[];
    },
    enabled: open,
    staleTime: 30_000,
  });

  // Load onboarding records for compliance checks
  const { data: onboardingRecords } = useQuery({
    queryKey: ["assign-driver-onboarding"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_onboarding")
        .select("*")
        .in("status", ["draft", "pending_review", "rejected"]);
      if (error) throw error;
      return (data ?? []) as OnboardingRecord[];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const onboardingMap = useMemo(() => {
    const map = new Map<string, OnboardingRecord>();
    for (const r of onboardingRecords ?? []) {
      if (r.linked_user_id) map.set(r.linked_user_id, r);
    }
    return map;
  }, [onboardingRecords]);

  const assignMutation = useMutation({
    mutationFn: async (driver: DriverOption) => {
      const displayName = driver.display_name || driver.full_name;
      const { error } = await supabase
        .from("jobs")
        .update({
          driver_id: driver.id,
          driver_name: displayName,
        } as any)
        .eq("id", jobId);
      if (error) throw error;
      return displayName;
    },
    onSuccess: (displayName) => {
      invalidateForEvent(queryClient, "driver_assignment_changed");
      toast({ title: `${displayName} assigned to ${jobRef}` });
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        title: "Assignment failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("jobs")
        .update({
          driver_id: null,
          driver_name: null,
        } as any)
        .eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateForEvent(queryClient, "driver_assignment_changed");
      toast({ title: `Driver unassigned from ${jobRef}` });
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        title: "Unassign failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const filtered = useMemo(() => {
    if (!drivers) return [];
    if (!search.trim()) return drivers;
    const s = search.toLowerCase();
    return drivers.filter(
      (d) =>
        d.full_name.toLowerCase().includes(s) ||
        d.display_name?.toLowerCase().includes(s) ||
        d.phone?.toLowerCase().includes(s) ||
        d.trade_plate_number?.toLowerCase().includes(s)
    );
  }, [drivers, search]);

  const isMutating = assignMutation.isPending || unassignMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Assign Driver — {jobRef}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Select an active, eligible driver to assign to this job.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search drivers…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {currentDriverId && (
          <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/50 border border-border">
            <span className="text-xs text-muted-foreground">Currently assigned</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2 text-destructive"
              disabled={isMutating}
              onClick={() => unassignMutation.mutate()}
            >
              <X className="h-3 w-3 mr-0.5" /> Unassign
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5 -mx-1 px-1">
          {driversLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No active drivers found.
            </p>
          ) : (
            filtered.map((driver) => {
              const isCurrentDriver = driver.id === currentDriverId;
              const label = driver.display_name || driver.full_name;
              const eligibility = checkDriverEligibility(driver, onboardingMap);
              return (
                <button
                  key={driver.id}
                  disabled={isMutating || (!isCurrentDriver && !eligibility.eligible)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left transition-colors
                    ${isCurrentDriver
                      ? "bg-primary/10 border border-primary/20"
                      : eligibility.eligible
                        ? "hover:bg-muted/60 border border-transparent"
                        : "opacity-60 border border-transparent cursor-not-allowed"
                    }
                    disabled:opacity-50`}
                  onClick={() => {
                    if (!isCurrentDriver && eligibility.eligible) {
                      assignMutation.mutate(driver);
                    }
                  }}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-foreground truncate">
                      {label}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {[driver.phone, driver.trade_plate_number].filter(Boolean).join(" • ") || "No phone / plate"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isCurrentDriver && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-primary border-primary/30">
                        <UserCheck className="h-2.5 w-2.5 mr-0.5" /> Current
                      </Badge>
                    )}
                    {!eligibility.eligible && !isCurrentDriver && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-destructive border-destructive/30">
                        <ShieldAlert className="h-2.5 w-2.5 mr-0.5" /> {eligibility.reason}
                      </Badge>
                    )}
                    {assignMutation.isPending && assignMutation.variables?.id === driver.id && (
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
