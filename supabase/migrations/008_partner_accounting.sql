-- 008_partner_accounting.sql

CREATE TYPE partner_transaction_type AS ENUM (
  'CAPITAL_INJECTION',
  'PROFIT_SHARE',
  'WITHDRAWAL'
);

CREATE TYPE partner_transaction_status AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);


CREATE TABLE IF NOT EXISTS partner_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  type              partner_transaction_type NOT NULL,
  amount            NUMERIC(12,2) NOT NULL,
  status            partner_transaction_status NOT NULL DEFAULT 'APPROVED',
  notes             TEXT,
  requested_by      UUID REFERENCES auth.users(id),
  resolved_by       UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_partner_modtime()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER partners_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION update_partner_modtime();
CREATE TRIGGER partner_transactions_updated_at BEFORE UPDATE ON partner_transactions FOR EACH ROW EXECUTE FUNCTION update_partner_modtime();

-- Trigger to update partner balance automatically when transaction is approved
CREATE OR REPLACE FUNCTION update_partner_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_balance NUMERIC(12,2);
  v_pid UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_pid := OLD.partner_id;
  ELSE
    v_pid := NEW.partner_id;
  END IF;

  SELECT COALESCE(SUM(
    CASE 
      WHEN type = 'WITHDRAWAL' THEN -amount
      ELSE amount
    END
  ), 0) INTO v_balance
  FROM partner_transactions
  WHERE partner_id = v_pid AND status = 'APPROVED';

  UPDATE partners SET balance = v_balance WHERE id = v_pid;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_partner_tx_change
  AFTER INSERT OR UPDATE OR DELETE ON partner_transactions
  FOR EACH ROW EXECUTE FUNCTION update_partner_balance();
