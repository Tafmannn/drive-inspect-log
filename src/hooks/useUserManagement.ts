import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listUsers,
  getUser,
  createUser,
  updateProfile,
  setUserRole,
  activateUser,
  suspendUser,
  reactivateUser,
  archiveDriver,
  restoreDriver,
  syncProfiles,
  type UserProfile,
} from "@/lib/userLifecycleApi";
import { toast } from "@/hooks/use-toast";

const KEY = "user-management";

export function useUserList(filters?: { org_id?: string; account_status?: string; role?: string }) {
  return useQuery<UserProfile[]>({
    queryKey: [KEY, "list", filters],
    queryFn: () => listUsers(filters),
    staleTime: 15_000,
  });
}

export function useUserDetail(userId: string | null) {
  return useQuery<UserProfile>({
    queryKey: [KEY, "detail", userId],
    queryFn: () => getUser(userId!),
    enabled: !!userId,
    staleTime: 10_000,
  });
}

function useLifecycleMutation<T extends any[]>(
  actionFn: (...args: T) => Promise<any>,
  successMsg: string
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (...args: T) => actionFn(...args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast({ title: successMsg });
    },
    onError: (err: Error) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });
}

export function useCreateUser() {
  return useLifecycleMutation(
    (params: Parameters<typeof createUser>[0]) => createUser(params),
    "User created"
  );
}

export function useUpdateProfile() {
  return useLifecycleMutation(
    (userId: string, fields: Parameters<typeof updateProfile>[1]) => updateProfile(userId, fields),
    "Profile updated"
  );
}

export function useSetUserRole() {
  return useLifecycleMutation(
    (userId: string, role: string) => setUserRole(userId, role),
    "Role updated"
  );
}

export function useActivateUser() {
  return useLifecycleMutation(
    (userId: string) => activateUser(userId),
    "User activated"
  );
}

export function useSuspendUser() {
  return useLifecycleMutation(
    (userId: string, reason?: string) => suspendUser(userId, reason),
    "User suspended"
  );
}

export function useReactivateUser() {
  return useLifecycleMutation(
    (userId: string) => reactivateUser(userId),
    "User reactivated"
  );
}

export function useArchiveDriver() {
  return useLifecycleMutation(
    (userId: string, reason?: string) => archiveDriver(userId, reason),
    "Driver archived"
  );
}

export function useRestoreDriver() {
  return useLifecycleMutation(
    (userId: string, reactivate: boolean, note?: string) => restoreDriver(userId, reactivate, note),
    "Driver restored"
  );
}

export function useSyncProfiles() {
  return useLifecycleMutation(
    () => syncProfiles(),
    "Profiles synced"
  );
}
