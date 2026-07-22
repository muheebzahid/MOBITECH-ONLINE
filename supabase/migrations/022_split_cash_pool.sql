-- 022_split_cash_pool.sql

-- Add new limit columns for Turbo and SB
ALTER TABLE treasury_settings ADD COLUMN IF NOT EXISTS turbo_cash_limit NUMERIC(12,2) NOT NULL DEFAULT 150000.00;
ALTER TABLE treasury_settings ADD COLUMN IF NOT EXISTS sb_cash_limit NUMERIC(12,2) NOT NULL DEFAULT 150000.00;
ALTER TABLE treasury_settings DROP COLUMN IF EXISTS cash_limit;

-- Update funding_source for existing deals
-- ecoATM deals to TURBO_CASH
UPDATE deals SET funding_source = 'TURBO_CASH' WHERE funding_source = 'CASH_POOL' AND supplier ILIKE '%ecoatm%';
-- All other cash deals to SB_CASH
UPDATE deals SET funding_source = 'SB_CASH' WHERE funding_source = 'CASH_POOL';

-- Convert repayment source to text to bypass enum limitations in transactions
ALTER TABLE repayments ALTER COLUMN source TYPE text USING source::text;
DROP TYPE IF EXISTS repayment_source CASCADE;

-- Update Repayments source ENUM equivalent values
UPDATE repayments SET source = 'SB_CASH' WHERE source = 'CASH_POOL';
