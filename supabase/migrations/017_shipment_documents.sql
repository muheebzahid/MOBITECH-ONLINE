-- ============================================================
-- MIGRATION: 017_shipment_documents.sql
-- Create shipment_documents table and configure shipments storage bucket
-- ============================================================

-- Create shipment_documents table
CREATE TABLE IF NOT EXISTS shipment_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id   UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant privileges
GRANT ALL PRIVILEGES ON TABLE shipment_documents TO authenticated;
GRANT ALL PRIVILEGES ON TABLE shipment_documents TO service_role;
GRANT ALL PRIVILEGES ON TABLE shipment_documents TO postgres;

-- Enable RLS
ALTER TABLE shipment_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select shipment_documents" ON shipment_documents;
CREATE POLICY "Authenticated users can select shipment_documents" 
  ON shipment_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert shipment_documents" ON shipment_documents;
CREATE POLICY "Authenticated users can insert shipment_documents" 
  ON shipment_documents FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete shipment_documents" ON shipment_documents;
CREATE POLICY "Authenticated users can delete shipment_documents" 
  ON shipment_documents FOR DELETE TO authenticated USING (true);

-- Create storage bucket for shipments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('shipments', 'shipments', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for shipments
DROP POLICY IF EXISTS "Public Select Shipments" ON storage.objects;
CREATE POLICY "Public Select Shipments" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'shipments');

DROP POLICY IF EXISTS "Auth Insert Shipments" ON storage.objects;
CREATE POLICY "Auth Insert Shipments" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'shipments' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Update Shipments" ON storage.objects;
CREATE POLICY "Auth Update Shipments" 
ON storage.objects FOR UPDATE 
WITH CHECK (bucket_id = 'shipments' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Auth Delete Shipments" ON storage.objects;
CREATE POLICY "Auth Delete Shipments" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'shipments' AND auth.role() = 'authenticated');
