-- Add pdf_url to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Setup storage bucket for invoices
INSERT INTO storage.buckets (id, name, public) 
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'invoices');

CREATE POLICY "Auth Insert" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'authenticated');

CREATE POLICY "Auth Update"
ON storage.objects FOR UPDATE
WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'authenticated');

CREATE POLICY "Auth Delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');
