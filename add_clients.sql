-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select clients" 
  ON clients FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert clients" 
  ON clients FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update clients" 
  ON clients FOR UPDATE TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete clients" 
  ON clients FOR DELETE TO authenticated USING (true);

-- Migrate existing unique customers to clients table
INSERT INTO clients (name, email, phone, address)
SELECT DISTINCT ON (customer_name) 
  customer_name, 
  customer_email, 
  customer_phone, 
  customer_address
FROM invoices
ON CONFLICT (name) DO NOTHING;

-- Add client_id column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Link existing invoices to clients
UPDATE invoices i
SET client_id = c.id
FROM clients c
WHERE i.customer_name = c.name;
