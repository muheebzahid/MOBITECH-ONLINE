-- 009_treasury.sql

CREATE TABLE IF NOT EXISTS treasury_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amex_limit        NUMERIC(12,2) NOT NULL DEFAULT 500000.00,
  cash_limit        NUMERIC(12,2) NOT NULL DEFAULT 300000.00,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
