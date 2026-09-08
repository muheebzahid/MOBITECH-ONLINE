-- ============================================================
-- MIGRATION: 026_invoice_documents.sql
-- Create invoice_documents table for multiple attachments on sales invoices
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  file_size     BIGINT,
  uploaded_by   UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant privileges
GRANT ALL PRIVILEGES ON TABLE invoice_documents TO authenticated;
GRANT ALL PRIVILEGES ON TABLE invoice_documents TO service_role;
GRANT ALL PRIVILEGES ON TABLE invoice_documents TO postgres;

-- Enable RLS
ALTER TABLE invoice_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select invoice_documents" ON invoice_documents;
CREATE POLICY "Authenticated users can select invoice_documents" 
  ON invoice_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert invoice_documents" ON invoice_documents;
CREATE POLICY "Authenticated users can insert invoice_documents" 
  ON invoice_documents FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete invoice_documents" ON invoice_documents;
CREATE POLICY "Authenticated users can delete invoice_documents" 
  ON invoice_documents FOR DELETE TO authenticated USING (true);

-- Backfill existing single pdf_url from invoices into invoice_documents
INSERT INTO invoice_documents (invoice_id, name, file_url, created_at)
SELECT id, 'Invoice Document', pdf_url, created_at
FROM invoices
WHERE pdf_url IS NOT NULL AND pdf_url != ''
AND NOT EXISTS (
  SELECT 1 FROM invoice_documents WHERE invoice_documents.invoice_id = invoices.id AND invoice_documents.file_url = invoices.pdf_url
);
