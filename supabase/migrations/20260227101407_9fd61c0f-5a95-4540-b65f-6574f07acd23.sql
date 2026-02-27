
-- Add billable_on_pod flag to expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS billable_on_pod BOOLEAN NOT NULL DEFAULT true;
