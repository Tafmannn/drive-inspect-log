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

function onSuccess(qc: ReturnType<typeof useQueryClient>, msg: string) {
  qc.invalidateQueries({ queryKey: [KEY] });
  toast({ title: msg });
}

function onError(err: Error) {
  toast({ title: "Action failed", description: err.message, variant: "destructive" });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Parameters<typeof createUser>[0]) => createUser(params),
    onSuccess: () => onSuccess(qc, "User created"),
    onError,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; fields: Parameters<typeof updateProfile>[1] }) =>
      updateProfile(vars.userId, vars.fields),
    onSuccess: () => onSuccess(qc, "Profile updated"),
    onError,
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; role: string }) => setUserRole(vars.userId, vars.role),
    onSuccess: () => onSuccess(qc, "Role updated"),
    onError,
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => activateUser(userId),
    onSuccess: () => onSuccess(qc, "User activated"),
    onError,
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; reason?: string }) => suspendUser(vars.userId, vars.reason),
    onSuccess: () => onSuccess(qc, "User suspended"),
    onError,
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => reactivateUser(userId),
    onSuccess: () => onSuccess(qc, "User reactivated"),
    onError,
  });
}

export function useArchiveDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; reason?: string }) => archiveDriver(vars.userId, vars.reason),
    onSuccess: () => onSuccess(qc, "Driver archived"),
    onError,
  });
}

export function useRestoreDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; reactivate: boolean; note?: string }) =>
      restoreDriver(vars.userId, vars.reactivate, vars.note),
    onSuccess: () => onSuccess(qc, "Driver restored"),
    onError,
  });
}

export function useSyncProfiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncProfiles(),
    onSuccess: () => onSuccess(qc, "Profiles synced"),
    onError,
  });
}
