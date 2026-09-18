-- Migration: Create AT&T Closing Prices table
CREATE TABLE IF NOT EXISTS public.att_closing_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT NOT NULL,
  storage TEXT NOT NULL,
  grade TEXT NOT NULL,
  carrier TEXT DEFAULT 'Unlocked',
  closing_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  auction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by model, storage, and grade
CREATE INDEX IF NOT EXISTS idx_att_closing_prices_model_storage_grade 
ON public.att_closing_prices(model, storage, grade);

CREATE INDEX IF NOT EXISTS idx_att_closing_prices_date 
ON public.att_closing_prices(auction_date DESC);

-- Enable RLS
ALTER TABLE public.att_closing_prices ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated/anon roles read/write access (standard for local/ERP setup)
CREATE POLICY "Allow read access to att_closing_prices" 
ON public.att_closing_prices FOR SELECT USING (true);

CREATE POLICY "Allow insert access to att_closing_prices" 
ON public.att_closing_prices FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update access to att_closing_prices" 
ON public.att_closing_prices FOR UPDATE USING (true);

CREATE POLICY "Allow delete access to att_closing_prices" 
ON public.att_closing_prices FOR DELETE USING (true);

GRANT ALL ON public.att_closing_prices TO anon, authenticated, service_role;
