ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS client_phone text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS client_email text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS client_company text;