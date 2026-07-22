-- 009_treasury.sql

CREATE TABLE IF NOT EXISTS treasury_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amex_limit        NUMERIC(12,2) NOT NULL DEFAULT 500000.00,
  cash_limit        NUMERIC(12,2) NOT NULL DEFAULT 300000.00,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE treasury_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view treasury settings" ON treasury_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update treasury settings" ON treasury_settings FOR UPDATE TO authenticated USING (true);
GRANT SELECT, INSERT, UPDATE ON treasury_settings TO authenticated;

-- Seed initial settings
INSERT INTO treasury_settings (amex_limit, cash_limit) VALUES (500000.00, 300000.00);

CREATE TABLE IF NOT EXISTS wire_transfers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           UUID REFERENCES deals(id) ON DELETE SET NULL,
  amount            NUMERIC(12,2) NOT NULL,
  destination       TEXT NOT NULL,
  notes             TEXT,
  logged_by         UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE repayment_source AS ENUM ('AMEX', 'CASH_POOL');

CREATE TABLE IF NOT EXISTS repayments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount            NUMERIC(12,2) NOT NULL,
  source            repayment_source NOT NULL,
  notes             TEXT,
  logged_by         UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_treasury_modtime()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER treasury_settings_updated_at BEFORE UPDATE ON treasury_settings FOR EACH ROW EXECUTE FUNCTION update_treasury_modtime();

-- RLS for wire_transfers
ALTER TABLE wire_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY wire_transfers_select ON wire_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY wire_transfers_insert ON wire_transfers FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT, INSERT ON wire_transfers TO authenticated;

-- RLS for repayments
ALTER TABLE repayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY repayments_select ON repayments FOR SELECT TO authenticated USING (true);
CREATE POLICY repayments_insert ON repayments FOR INSERT TO authenticated WITH CHECK (true);
GRANT SELECT, INSERT ON repayments TO authenticated;

