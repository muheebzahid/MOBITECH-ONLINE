-- ============================================================
-- MIGRATION: 005_sales_invoicing.sql
-- Sales, Invoices, Line Items, and Payments
-- ============================================================

-- Invoice status enum
CREATE TYPE invoice_status AS ENUM (
  'DRAFT',
  'ISSUED',
  'PARTIAL',
  'PAID',
  'CANCELLED'
);

-- Payment method enum
CREATE TYPE payment_method AS ENUM (
  'WIRE_TRANSFER',
  'CASH',
  'CREDIT_CARD',
  'OTHER'
);

-- INVOICES TABLE
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number    TEXT NOT NULL UNIQUE,
  
  -- Customer Details (Simple text for now)
  customer_name     TEXT NOT NULL,
  customer_email    TEXT,
  customer_address  TEXT,
  customer_phone    TEXT,
  
  -- Dates
  issue_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  
  -- Status
  status            invoice_status NOT NULL DEFAULT 'DRAFT',
  
  -- Financials
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid       NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_due       NUMERIC(12,2) NOT NULL DEFAULT 0,
  
  -- Metadata
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- Auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_invoice_number();

-- Updated_at trigger for invoices
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_invoices_updated_at();

-- INVOICE LINE ITEMS
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  deal_id       UUID REFERENCES deals(id) ON DELETE SET NULL, -- Optional link to a specific deal/batch
  
  description   TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price   NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRIGGER: Auto-update invoice subtotal and totals when line items change
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_invoice_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  SELECT COALESCE(SUM(total_price), 0) INTO v_subtotal
  FROM invoice_line_items
  WHERE invoice_id = v_invoice_id;

  UPDATE invoices
  SET subtotal = v_subtotal,
      total_amount = v_subtotal - discount,
      balance_due = (v_subtotal - discount) - amount_paid
  WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_invoice_line_item_change
  AFTER INSERT OR UPDATE OR DELETE ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION update_invoice_totals();

-- PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  amount            NUMERIC(12,2) NOT NULL,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method    payment_method NOT NULL DEFAULT 'WIRE_TRANSFER',
  reference_number  TEXT,
  notes             TEXT,
  
  logged_by         UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRIGGER: Auto-update invoice amount_paid, balance_due, and status when payment is logged
CREATE OR REPLACE FUNCTION update_invoice_payments()
RETURNS TRIGGER AS $$
DECLARE
  v_amount_paid NUMERIC(12,2);
  v_invoice_id UUID;
  v_total_amount NUMERIC(12,2);
  v_status invoice_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  -- Get total payments
  SELECT COALESCE(SUM(amount), 0) INTO v_amount_paid
  FROM payments
  WHERE invoice_id = v_invoice_id;

  -- Get invoice details
  SELECT total_amount, status INTO v_total_amount, v_status
  FROM invoices
  WHERE id = v_invoice_id;

  -- Calculate new status
  IF v_amount_paid >= v_total_amount AND v_total_amount > 0 THEN
    v_status := 'PAID';
  ELSIF v_amount_paid > 0 THEN
    v_status := 'PARTIAL';
  ELSIF v_status = 'PAID' OR v_status = 'PARTIAL' THEN
    -- If payments were deleted and now amount_paid is 0
    v_status := 'ISSUED';
  END IF;

  -- Update invoice
  UPDATE invoices
  SET amount_paid = v_amount_paid,
      balance_due = total_amount - v_amount_paid,
      status = v_status
  WHERE id = v_invoice_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_payment_change
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_payments();

-- RLS policies
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can manage invoices"
  ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users can manage invoice_line_items"
  ON invoice_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users can manage payments"
  ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoice_lines_invoice ON invoice_line_items(invoice_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
