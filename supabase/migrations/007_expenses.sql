-- 007_expenses.sql

CREATE TYPE expense_category AS ENUM (
  'RENT',
  'SOFTWARE',
  'OFFICE_SUPPLIES',
  'TRAVEL',
  'MARKETING',
  'LEGAL_FEES',
  'UTILITIES',
  'PAYROLL',
  'OTHER'
);

CREATE TABLE IF NOT EXISTS operating_expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category          expense_category NOT NULL DEFAULT 'OTHER',
  description       TEXT NOT NULL,
  amount            NUMERIC(12,2) NOT NULL,
  expense_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  logged_by         UUID REFERENCES auth.users(id),
  reference_link    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated_at trigger for expenses
CREATE OR REPLACE FUNCTION update_operating_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operating_expenses_updated_at
  BEFORE UPDATE ON operating_expenses
  FOR EACH ROW EXECUTE FUNCTION update_operating_expenses_updated_at();

ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage operating_expenses"
  ON operating_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
