-- Clean invoice customer names
UPDATE invoices SET customer_name = TRIM(customer_name);

-- Merge duplicate client accounts due to whitespace differences
DO $$
DECLARE
  r RECORD;
  primary_id UUID;
BEGIN
  FOR r IN 
    SELECT TRIM(name) AS trimmed_name, count(*) 
    FROM clients 
    GROUP BY TRIM(name) 
    HAVING count(*) > 1
  LOOP
    -- Select primary client account (first created)
    SELECT id INTO primary_id 
    FROM clients 
    WHERE TRIM(name) = r.trimmed_name 
    ORDER BY created_at ASC 
    LIMIT 1;

    -- Map all invoices of duplicates to the primary client
    UPDATE invoices 
    SET client_id = primary_id 
    WHERE client_id IN (
      SELECT id FROM clients 
      WHERE TRIM(name) = r.trimmed_name AND id <> primary_id
    );

    -- Delete the duplicate client records
    DELETE FROM clients 
    WHERE TRIM(name) = r.trimmed_name AND id <> primary_id;
  END LOOP;
END $$;

-- Trim all names in clients
UPDATE clients SET name = TRIM(name);

-- Add trigger to automatically trim names on insert or update
CREATE OR REPLACE FUNCTION clean_client_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.name = TRIM(NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clean_client_name ON clients;
CREATE TRIGGER trigger_clean_client_name
BEFORE INSERT OR UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION clean_client_name();
