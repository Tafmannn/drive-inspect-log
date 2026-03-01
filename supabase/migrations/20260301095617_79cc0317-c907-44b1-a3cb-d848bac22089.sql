
-- Create client_logs table for lightweight client-side event logging
CREATE TABLE public.client_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id text,
  job_id text,
  severity text NOT NULL DEFAULT 'info',
  event text NOT NULL,
  message text,
  context jsonb
);

-- Enable RLS
ALTER TABLE public.client_logs ENABLE ROW LEVEL SECURITY;

-- Allow inserts from anon (best-effort logging, no auth required)
CREATE POLICY "Allow insert for anon on client_logs"
  ON public.client_logs
  FOR INSERT
  WITH CHECK (true);

-- Allow select for admin viewing
CREATE POLICY "Allow select for anon on client_logs"
  ON public.client_logs
  FOR SELECT
  USING (true);
