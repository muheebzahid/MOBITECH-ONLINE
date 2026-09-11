-- ============================================================
-- MIGRATION: 027_robust_invoice_number_generation.sql
-- Collision-proof auto-healing invoice number generation
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  v_year TEXT;
  v_next_val INT;
  v_candidate TEXT;
  v_max_num INT;
BEGIN
  -- If invoice_number is already explicitly provided and not empty, keep it
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;

  v_year := to_char(COALESCE(NEW.issue_date, CURRENT_DATE), 'YYYY');
  
  -- Find the highest existing numerical suffix for the current year
  SELECT COALESCE(MAX(
    CASE 
      WHEN invoice_number ~ ('^INV-' || v_year || '-[0-9]+')
      THEN CAST(SUBSTRING(invoice_number FROM ('^INV-' || v_year || '-([0-9]+)')) AS INTEGER)
      ELSE 0
    END
  ), 0) INTO v_max_num
  FROM invoices;

  -- Ensure sequence is at least v_max_num
  LOOP
    v_next_val := nextval('invoice_number_seq');
    IF v_next_val <= v_max_num THEN
      PERFORM setval('invoice_number_seq', v_max_num);
      v_next_val := nextval('invoice_number_seq');
    END IF;

    v_candidate := 'INV-' || v_year || '-' || LPAD(v_next_val::TEXT, 4, '0');
    
    -- Check if candidate invoice_number already exists
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_number = v_candidate) THEN
      NEW.invoice_number := v_candidate;
      EXIT;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger on invoices table
DROP TRIGGER IF EXISTS set_invoice_number ON invoices;
CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_invoice_number();
