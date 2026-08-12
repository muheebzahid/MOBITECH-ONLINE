-- 024_treasury_settlements.sql

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
CREATE POLICY treasury_transactions_select ON public.treasury_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY treasury_transactions_insert ON public.treasury_transactions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY treasury_transactions_update ON public.treasury_transactions FOR UPDATE TO authenticated USING (true);
CREATE POLICY treasury_transactions_delete ON public.treasury_transactions FOR DELETE TO authenticated USING (true);
GRANT ALL ON public.treasury_transactions TO authenticated, service_role, anon;
