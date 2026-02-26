
-- Add is_hidden flag for soft-delete/archive on jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- Add is_hidden flag for soft-delete on expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- Index for efficient filtering of non-hidden records
CREATE INDEX IF NOT EXISTS idx_jobs_is_hidden ON public.jobs (is_hidden) WHERE is_hidden = false;
CREATE INDEX IF NOT EXISTS idx_expenses_is_hidden ON public.expenses (is_hidden) WHERE is_hidden = false;
