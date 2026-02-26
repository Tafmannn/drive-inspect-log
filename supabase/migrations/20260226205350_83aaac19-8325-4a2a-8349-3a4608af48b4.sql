
-- Create expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  driver_id TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  time TIME,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  category TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  upload_status TEXT NOT NULL DEFAULT 'synced',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Allow anon access (matching existing pattern)
CREATE POLICY "Allow all for anon on expenses"
  ON public.expenses
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create expense_receipts table for photos
CREATE TABLE public.expense_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  backend TEXT NOT NULL DEFAULT 'internal',
  backend_ref TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon on expense_receipts"
  ON public.expense_receipts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add updated_at trigger for expenses
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for job lookup
CREATE INDEX idx_expenses_job_id ON public.expenses(job_id);
CREATE INDEX idx_expenses_date ON public.expenses(date DESC);
CREATE INDEX idx_expense_receipts_expense_id ON public.expense_receipts(expense_id);
