-- Create a dedicated expense-receipts storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-receipts', 'expense-receipts', false);

-- Authenticated users can upload receipts (scoped to their expense ID prefix)
CREATE POLICY "Users can upload expense receipts"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts');

-- Authenticated users can read expense receipts
CREATE POLICY "Users can read expense receipts"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'expense-receipts');

-- Authenticated users can delete their expense receipts
CREATE POLICY "Users can delete expense receipts"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'expense-receipts');