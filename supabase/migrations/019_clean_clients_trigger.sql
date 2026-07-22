-- ============================================================
-- MIGRATION: 019_clean_clients_trigger.sql
-- Automatically trims whitespace from client names on insert/update
-- ============================================================

-- Function to trim whitespace from client names
CREATE OR REPLACE FUNCTION clean_client_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.name = TRIM(NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute before insert or update
DROP TRIGGER IF EXISTS trigger_clean_client_name ON clients;
CREATE TRIGGER trigger_clean_client_name
BEFORE INSERT OR UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION clean_client_name();
