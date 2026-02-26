
-- Add customer_name to inspections
ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS customer_name text;

-- Add label to photos
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS label text;
