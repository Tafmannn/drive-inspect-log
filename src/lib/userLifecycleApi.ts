/**
 * userLifecycleApi — client-side wrappers for the user-lifecycle edge function.
 */
import { supabase } from "@/integrations/supabase/client";

export interface UserProfile {
  id: string;
  auth_user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string;
  phone: string | null;
  org_id: string | null;
  role: string;
  account_status: "pending_activation" | "active" | "suspended";
  is_protected: boolean;
  internal_notes: string | null;
  profile_photo_path: string | null;
  permissions: Record<string, any>;
  activated_at: string | null;
  activated_by: string | null;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined driver_profiles (array from Supabase join)
  driver_profiles?: Array<{
    id: string;
    is_active: boolean;
    archived_at: string | null;
    full_name: string;
    display_name: string | null;
    licence_expiry: string | null;
    archived_by?: string | null;
    archive_reason?: string | null;
    restored_at?: string | null;
    restored_by?: string | null;
    restore_note?: string | null;
    [key: string]: any;
  }>;
}

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("user-lifecycle", { body });
  if (error) throw new Error(error.message ?? "Request failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function listUsers(filters?: {
  org_id?: string;
  account_status?: string;
  role?: string;
}): Promise<UserProfile[]> {
  const result = await invoke({ _action: "list", ...filters });
  return result.users ?? [];
}

export async function getUser(userId: string): Promise<UserProfile> {
  const result = await invoke({ _action: "get", user_id: userId });
  return result.user;
}

export async function createUser(params: {
  email: string;
  role?: string;
  org_id: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  phone?: string;
}): Promise<string> {
  const result = await invoke({ _action: "create", ...params });
  return result.user_id;
}

export async function updateProfile(
  userId: string,
  fields: Partial<Pick<UserProfile, "first_name" | "last_name" | "display_name" | "phone" | "internal_notes" | "profile_photo_path">>
): Promise<void> {
  await invoke({ _action: "update_profile", user_id: userId, ...fields });
}

export async function setUserRole(userId: string, role: string): Promise<void> {
  await invoke({ _action: "set_role", user_id: userId, role });
}

export async function activateUser(userId: string): Promise<void> {
  await invoke({ _action: "activate", user_id: userId });
}

export async function suspendUser(userId: string, reason?: string): Promise<void> {
  await invoke({ _action: "suspend", user_id: userId, reason });
}

export async function reactivateUser(userId: string): Promise<void> {
  await invoke({ _action: "reactivate", user_id: userId });
}

export async function archiveDriver(userId: string, reason?: string): Promise<void> {
  await invoke({ _action: "archive_driver", user_id: userId, reason });
}

export async function restoreDriver(userId: string, reactivateAccount: boolean, note?: string): Promise<void> {
  await invoke({ _action: "restore_driver", user_id: userId, reactivate_account: reactivateAccount, note });
}

export async function syncProfiles(): Promise<number> {
  const result = await invoke({ _action: "sync_profiles" });
  return result.synced ?? 0;
}
