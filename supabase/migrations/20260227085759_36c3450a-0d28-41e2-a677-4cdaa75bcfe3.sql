
-- Google Sheets sync configuration (singleton per sheet connection)
CREATE TABLE public.sheet_sync_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL DEFAULT 'Jobs',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  column_mapping JSONB NOT NULL DEFAULT '{
    "A": {"header": "Date", "job_field": "created_at", "direction": "app_to_sheet"},
    "B": {"header": "Client", "job_field": "pickup_company", "direction": "app_to_sheet"},
    "C": {"header": "Reg", "job_field": "vehicle_reg", "direction": "app_to_sheet"},
    "D": {"header": "Start PC", "job_field": "pickup_postcode", "direction": "app_to_sheet"},
    "E": {"header": "End PC", "job_field": "delivery_postcode", "direction": "app_to_sheet"},
    "F": {"header": "Miles", "job_field": "odometer_miles", "direction": "app_to_sheet"},
    "G": {"header": "Rate", "job_field": "admin_rate", "direction": "sheet_to_app"},
    "H": {"header": "Expenses", "job_field": "total_expenses", "direction": "app_to_sheet"},
    "I": {"header": "Total", "job_field": null, "direction": "sheet_only"},
    "J": {"header": "Status", "job_field": "status", "direction": "sheet_to_app"},
    "K": {"header": "Invoice Link", "job_field": "pod_pdf_url", "direction": "app_to_sheet"},
    "L": {"header": "Job ID", "job_field": "external_job_number", "direction": "anchor"},
    "M": {"header": "Alerts", "job_field": null, "direction": "sheet_only"},
    "N": {"header": "Bid Phrase", "job_field": null, "direction": "sheet_only"}
  }'::jsonb,
  last_push_at TIMESTAMPTZ,
  last_pull_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sheet_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sheet sync config"
  ON public.sheet_sync_config FOR ALL USING (true);

-- Sync log for audit trail
CREATE TABLE public.sheet_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'error')),
  rows_processed INT NOT NULL DEFAULT 0,
  rows_created INT NOT NULL DEFAULT 0,
  rows_updated INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sheet_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sync logs"
  ON public.sheet_sync_logs FOR SELECT USING (true);

CREATE POLICY "System can insert sync logs"
  ON public.sheet_sync_logs FOR INSERT WITH CHECK (true);

-- Add admin_rate and pod_pdf_url fields to jobs table for sheet sync
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS admin_rate NUMERIC(10,2);
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pod_pdf_url TEXT;

-- Trigger for updated_at on config
CREATE TRIGGER update_sheet_sync_config_updated_at
  BEFORE UPDATE ON public.sheet_sync_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
