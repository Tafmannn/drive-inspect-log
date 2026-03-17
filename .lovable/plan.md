

## Plan: Complete Lifecycle User Management — Next Stage

### What's Already Done
- Database: `user_profiles`, `driver_profiles` archive fields, `admin_audit_log`, RLS policies, helper functions, `permissions_catalog`, `role_permission_templates`, `user_permission_overrides`, views
- Edge function: `user-lifecycle` with list/get/create/update_profile/set_role/activate/suspend/reactivate/archive_driver/restore_driver/sync_profiles
- UI: `UserIndex` (search, filters), `UserDetailEditor` (identity, role select, account actions, basic driver section, archive/restore), `CreateUserModal`, status badges
- Auth: `ProtectedRoute` blocks suspended/pending users, `AuthContext` fetches `accountStatus`
- Data: 4 users synced, `is_protected` flag on protected account (needs setting)

### What's Missing (Prioritized)

#### 1. Driver Profile Editing in UserDetailEditor
The driver section currently only displays 3 read-only fields. The spec requires editable fields: licence_number, licence_expiry, date_of_birth, address (line1/2, city, postcode), emergency_contact_name, emergency_contact_phone, trade_plate_number, employment_type, notes. Need a new `update_driver_profile` action in the edge function and form fields in the UI.

#### 2. Permissions UI (Grouped Permission Editor)
The `permissions_catalog` and `role_permission_templates` tables exist with 27 permissions across 8 categories. The `user_permission_overrides` table exists. But the UserDetailEditor has no permissions section. Need to:
- Add a `get_permissions` action to the edge function that returns the catalog, role defaults, and user overrides
- Add a `set_permission_override` action to the edge function with escalation checks
- Build a grouped permission editor component showing categories with allow/deny/default toggles

#### 3. Profile Photo Upload/Replace/Remove
The `profile-photos` storage bucket exists with RLS policies. Need:
- Upload component in UserDetailEditor with preview and fallback avatar
- `profile_photo_path` already supported in `update_profile` action
- Helper to resolve storage URL from path

#### 4. Organisation Filter for Super Admin
The UserIndex has role/status/archive filters but no org filter for super admins. Need to add an org selector that queries `organisations` table.

#### 5. Set Protected Account
The `is_protected` flag on `info@axentravehicles.com` is currently `false`. Need a migration to set it.

---

### Implementation Plan

**Task 1: Expand Driver Profile Editing**

Edge function — add `update_driver_profile` action:
- Accept `user_id` + driver fields (licence_number, licence_expiry, date_of_birth, address_line1, address_line2, city, postcode, emergency_contact_name, emergency_contact_phone, trade_plate_number, employment_type, notes)
- Validate caller is admin+same_org or super_admin
- Check target not protected (unless super_admin)
- Update `driver_profiles` where `user_id = target`
- Write audit log

UI — expand the Driver Profile section in `UserDetailEditor.tsx`:
- Add editable form fields for all driver columns
- Add a "Save Driver Profile" button
- Show fields only when `user.role === "driver"` and driver profile exists

Hook — add `useUpdateDriverProfile` mutation in `useUserManagement.ts`
API — add `updateDriverProfile` in `userLifecycleApi.ts`

**Task 2: Build Permissions Editor**

Edge function — add two actions:
- `get_permissions`: returns `{ catalog, role_defaults, overrides }` for a target user
- `set_permission_override`: accepts `user_id, permission_key, grant_type` (allow/deny/default). Validates:
  - Caller has authority (admin can't set sensitive permissions they don't have)
  - Super admin can set anything
  - Writes to `user_permission_overrides` table
  - Logs to `permission_audit_log`

UI — new `PermissionEditor` component:
- Fetch permissions via the edge function
- Group by category from catalog
- For each permission: show label, effective state (from role template + override), toggle control
- Admin sees only non-sensitive permissions they're allowed to grant
- Super admin sees all

Hook/API additions for permissions fetch and mutation.

**Task 3: Profile Photo Upload**

UI component in UserDetailEditor:
- Circular avatar preview (or fallback initials)
- Upload button triggers file picker
- Upload to `profile-photos/{org_id}/{auth_user_id}/{filename}` via Supabase storage
- On success, call `update_profile` with new `profile_photo_path`
- Remove button clears path and optionally deletes object
- Replace overwrites

Add a `resolveProfilePhotoUrl` helper in a shared lib file.

**Task 4: Org Filter + Protected Account**

- Add org `Select` in UserIndex (super admin only), pass to `useUserList` filters
- SQL migration: `UPDATE user_profiles SET is_protected = true WHERE lower(email) = 'info@axentravehicles.com'`

### File Changes Summary

| File | Change |
|---|---|
| `supabase/functions/user-lifecycle/index.ts` | Add `update_driver_profile`, `get_permissions`, `set_permission_override` actions |
| `src/lib/userLifecycleApi.ts` | Add `updateDriverProfile`, `getPermissions`, `setPermissionOverride` API functions |
| `src/hooks/useUserManagement.ts` | Add `useUpdateDriverProfile`, `usePermissions`, `useSetPermissionOverride` hooks |
| `src/features/users/components/UserDetailEditor.tsx` | Expand driver section with editable fields, add permissions section, add photo upload |
| `src/features/users/components/PermissionEditor.tsx` | New — grouped permission toggle UI |
| `src/features/users/components/ProfilePhotoUpload.tsx` | New — avatar upload/preview/remove |
| `src/features/users/components/UserIndex.tsx` | Add org filter for super admin |
| `src/lib/profilePhotoUtils.ts` | New — URL resolver helper |
| Migration SQL | Set `is_protected = true` for platform owner |

### Execution Order
1. Migration for protected account
2. Edge function updates (all 3 new actions)
3. API + hooks
4. UI components (driver fields, permissions, photo, org filter)
5. Deploy edge function
6. Manual verification

