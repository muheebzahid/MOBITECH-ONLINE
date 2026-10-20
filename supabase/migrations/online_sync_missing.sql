-- Apply missing online schema additions
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS handled_by TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS usa_to_usa_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS usa_to_dxb_cost NUMERIC(12,2) DEFAULT 0;

-- Treasury transactions
CREATE TABLE IF NOT EXISTS public.treasury_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_cycle VARCHAR(10) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  source_account VARCHAR(50) NOT NULL,
  destination_account VARCHAR(50) NOT NULL,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  transaction_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  reference_notes TEXT,
  deal_ids JSONB DEFAULT '[]'::jsonb,
  logged_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.treasury_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS treasury_transactions_select ON public.treasury_transactions;
CREATE POLICY treasury_transactions_select ON public.treasury_transactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS treasury_transactions_insert ON public.treasury_transactions;
CREATE POLICY treasury_transactions_insert ON public.treasury_transactions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS treasury_transactions_update ON public.treasury_transactions;
CREATE POLICY treasury_transactions_update ON public.treasury_transactions FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS treasury_transactions_delete ON public.treasury_transactions;
CREATE POLICY treasury_transactions_delete ON public.treasury_transactions FOR DELETE TO authenticated USING (true);
GRANT ALL ON public.treasury_transactions TO authenticated, service_role, anon;

-- Invoice documents
CREATE TABLE IF NOT EXISTS public.invoice_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  file_size     BIGINT,
  uploaded_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL PRIVILEGES ON TABLE public.invoice_documents TO authenticated, service_role, anon;
ALTER TABLE public.invoice_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select invoice_documents" ON public.invoice_documents;
CREATE POLICY "Authenticated users can select invoice_documents" 
  ON public.invoice_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert invoice_documents" ON public.invoice_documents;
CREATE POLICY "Authenticated users can insert invoice_documents" 
  ON public.invoice_documents FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete invoice_documents" ON public.invoice_documents;
CREATE POLICY "Authenticated users can delete invoice_documents" 
  ON public.invoice_documents FOR DELETE TO authenticated USING (true);
