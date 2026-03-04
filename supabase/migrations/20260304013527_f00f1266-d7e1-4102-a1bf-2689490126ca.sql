-- Set app_metadata for info@axentravehicles.com to include super_admin role and org_id
-- This ensures the JWT carries the correct claims for RLS policies
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || 
  '{"role": "super_admin", "roles": ["SUPERADMIN","ADMIN","DRIVER"], "org_id": "a0000000-0000-0000-0000-000000000001"}'::jsonb
WHERE email = 'info@axentravehicles.com';

-- Also set for the other super admin email if it exists
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || 
  '{"role": "super_admin", "roles": ["SUPERADMIN","ADMIN","DRIVER"], "org_id": "a0000000-0000-0000-0000-000000000001"}'::jsonb
WHERE email = 'axentravehiclelogistics@gmail.com';