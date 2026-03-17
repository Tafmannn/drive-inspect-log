/**
 * useDriverGate — resolves the current driver's onboarding status
 * and profile, gating what UI surfaces are accessible.
 *
 * For non-driver roles (ADMIN, SUPERADMIN), returns ungated = full access.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export type DriverGateStatus =
  | "loading"
  | "no_profile"       // auth account exists but no driver_profile row
  | "onboarding"       // draft / pending_review
  | "rejected"         // onboarding rejected
  | "active"           // approved + profile exists → full driver UI
  | "ungated";         // non-driver role (admin/superadmin) → no restrictions

export interface DriverGateResult {
  status: DriverGateStatus;
  driverProfileId: string | null;
  onboardingStatus: string | null;
  isDriverOnly: boolean;
}

export function useDriverGate(): DriverGateResult {
  const { user, isAdmin, isSuperAdmin, authLoading } = useAuth();

  // Admins / super-admins are never gated
  const isDriverOnly = !isAdmin && !isSuperAdmin && (user?.roles.includes("DRIVER") ?? false);

  const { data, isLoading } = useQuery({
    queryKey: ["driver-gate", user?.id],
    queryFn: async () => {
      if (!user?.id) return { profileId: null, onboardingStatus: null };

      // 1. Check driver_profiles for this user
      const { data: profile } = await supabase
        .from("driver_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      // 2. Check driver_onboarding status (linked by user_id or email)
      let onboardingStatus: string | null = null;
      const { data: onboarding } = await supabase
        .from("driver_onboarding")
        .select("status")
        .eq("linked_user_id", user.id)
        .maybeSingle();

      if (onboarding) {
        onboardingStatus = onboarding.status;
      } else if (user.email) {
        // Fallback: match by email if not linked yet
        const { data: byEmail } = await supabase
          .from("driver_onboarding")
          .select("status")
          .eq("email", user.email)
          .maybeSingle();
        if (byEmail) onboardingStatus = byEmail.status;
      }

      return {
        profileId: profile?.id ?? null,
        onboardingStatus,
      };
    },
    enabled: !!user?.id && isDriverOnly,
    staleTime: 60_000,
  });

  if (authLoading || (isDriverOnly && isLoading)) {
    return { status: "loading", driverProfileId: null, onboardingStatus: null, isDriverOnly };
  }

  if (!isDriverOnly) {
    return { status: "ungated", driverProfileId: null, onboardingStatus: null, isDriverOnly: false };
  }

  const profileId = data?.profileId ?? null;
  const onboardingStatus = data?.onboardingStatus ?? null;

  // No profile and no onboarding record at all
  if (!profileId && !onboardingStatus) {
    return { status: "no_profile", driverProfileId: null, onboardingStatus: null, isDriverOnly: true };
  }

  // Onboarding exists but not approved
  if (onboardingStatus === "draft" || onboardingStatus === "pending_review") {
    return { status: "onboarding", driverProfileId: profileId, onboardingStatus, isDriverOnly: true };
  }

  if (onboardingStatus === "rejected") {
    return { status: "rejected", driverProfileId: profileId, onboardingStatus, isDriverOnly: true };
  }

  // approved or no onboarding record but profile exists → active
  if (profileId) {
    return { status: "active", driverProfileId: profileId, onboardingStatus, isDriverOnly: true };
  }

  return { status: "no_profile", driverProfileId: null, onboardingStatus, isDriverOnly: true };
}
