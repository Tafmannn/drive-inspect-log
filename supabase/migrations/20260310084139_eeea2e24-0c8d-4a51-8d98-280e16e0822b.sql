
-- Add sort_order column to jobs for persistent manual ordering
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Add RLS policy for organisations INSERT/UPDATE by super_admin
CREATE POLICY "Super admins can manage organisations"
ON public.organisations
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());
