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
    licence_number: string | null;
    date_of_birth: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    postcode: string | null;
    phone: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    trade_plate_number: string | null;
    employment_type: string | null;
    notes: string | null;
    licence_categories: string[] | null;
    archived_by?: string | null;
    archive_reason?: string | null;
    restored_at?: string | null;
    restored_by?: string | null;
    restore_note?: string | null;
    [key: string]: any;
  }>;
}

export interface PermissionCatalogEntry {
  key: string;
  label: string;
  category: string;
  description: string | null;
  is_sensitive: boolean;
}

export interface PermissionsData {
  role: string;
  catalog: PermissionCatalogEntry[];
  role_defaults: Record<string, boolean>;
  overrides: Record<string, { permission_key: string; grant_type: string; granted_by: string | null; reason: string | null; updated_at: string }>;
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

export async function updateDriverProfile(
  userId: string,
  fields: Record<string, any>
): Promise<void> {
  await invoke({ _action: "update_driver_profile", user_id: userId, ...fields });
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

export async function getPermissions(userId: string): Promise<PermissionsData> {
  const result = await invoke({ _action: "get_permissions", user_id: userId });
  return result as PermissionsData;
}

export async function setPermissionOverride(
  userId: string,
  permissionKey: string,
  grantType: "allow" | "deny" | "default",
  reason?: string
): Promise<void> {
  await invoke({
    _action: "set_permission_override",
    user_id: userId,
    permission_key: permissionKey,
    grant_type: grantType,
    reason,
  });
}
