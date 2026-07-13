-- ============================================================
-- MIGRATION: 006_inventory.sql
-- Inventory Items (IMEI Tracking) and Location History
-- ============================================================

-- Inventory location enum
CREATE TYPE inventory_location AS ENUM (
  'MIAMI',
  'IN_TRANSIT',
  'DUBAI_WAREHOUSE',
  'AMAZON_FBA',
  'REVIBE',
  'SOLD',
  'RMA'
);

-- Inventory status enum
CREATE TYPE inventory_status AS ENUM (
  'AVAILABLE',
  'RESERVED',
  'SOLD',
  'RETURNED'
);

-- INVENTORY ITEMS TABLE
CREATE TABLE IF NOT EXISTS inventory_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  
  -- Identifiers
  imei              TEXT,
  serial_number     TEXT,
  
  -- Item Specifics (default to deal specifics, but can be updated individually)
  model             TEXT NOT NULL,
  storage           TEXT,
  color             TEXT,
  grade             TEXT,
  
  -- State
  location          inventory_location NOT NULL DEFAULT 'DUBAI_WAREHOUSE',
  status            inventory_status NOT NULL DEFAULT 'AVAILABLE',
  
  -- Financials
  unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0, -- Base cost from deal
  logistics_cost    NUMERIC(12,2) NOT NULL DEFAULT 0, -- Pro-rated logistics cost
  total_cost        NUMERIC(12,2) GENERATED ALWAYS AS (unit_cost + logistics_cost) STORED,
  
  -- Sales Link
  invoice_id        UUID REFERENCES invoices(id) ON DELETE SET NULL,
  
  -- Metadata
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure either IMEI or Serial Number is provided (or both)
-- Wait, sometimes items might not have either initially if scanned later, but usually they do. Let's make at least one required?
-- Actually, let's not strictly enforce it at DB level to allow flexibility if needed, but we'll enforce in UI.

-- Create unique constraint on IMEI if it's not null, ignoring nulls
CREATE UNIQUE INDEX idx_inventory_imei ON inventory_items (imei) WHERE imei IS NOT NULL AND imei != '';

-- Updated_at trigger for inventory
CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_inventory_updated_at();


-- INVENTORY HISTORY TABLE
CREATE TABLE IF NOT EXISTS inventory_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id           UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  
  old_location      inventory_location,
  new_location      inventory_location NOT NULL,
  old_status        inventory_status,
  new_status        inventory_status NOT NULL,
  
  notes             TEXT,
  changed_by        UUID REFERENCES auth.users(id),
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRIGGER: Auto-log inventory history when location or status changes
CREATE OR REPLACE FUNCTION log_inventory_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO inventory_history (item_id, old_location, new_location, old_status, new_status)
    VALUES (NEW.id, NULL, NEW.location, NULL, NEW.status);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.location IS DISTINCT FROM NEW.location OR OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO inventory_history (item_id, old_location, new_location, old_status, new_status)
      VALUES (NEW.id, OLD.location, NEW.location, OLD.status, NEW.status);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_inventory_change
  AFTER INSERT OR UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION log_inventory_history();


-- RLS policies
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can manage inventory"
  ON inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users can manage inventory history"
  ON inventory_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_inventory_deal ON inventory_items(deal_id);
CREATE INDEX idx_inventory_location ON inventory_items(location);
CREATE INDEX idx_inventory_status ON inventory_items(status);
CREATE INDEX idx_inventory_history_item ON inventory_history(item_id);
