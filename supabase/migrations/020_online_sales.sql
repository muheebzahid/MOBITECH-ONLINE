-- ============================================================
-- MIGRATION: 020_online_sales.sql
-- Online Sales Module (Amazon & Revibe)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'online_platform') THEN
    CREATE TYPE online_platform AS ENUM ('AMAZON', 'REVIBE');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS online_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number   TEXT NOT NULL UNIQUE,          -- AMZ-2026-XXXX or RVB-2026-XXXX
  platform       online_platform NOT NULL,
  customer_name  TEXT,
  customer_email TEXT,
  sale_date      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status         TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, SHIPPED, DELIVERED, CANCELLED
  total_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS and grants
ALTER TABLE online_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can query online_orders" ON online_orders;
DROP POLICY IF EXISTS "Authenticated users can insert online_orders" ON online_orders;
DROP POLICY IF EXISTS "Authenticated users can update online_orders" ON online_orders;
DROP POLICY IF EXISTS "Authenticated users can delete online_orders" ON online_orders;

DROP POLICY IF EXISTS "Authenticated users can query online_orders" ON online_orders;
CREATE POLICY "Authenticated users can query online_orders" ON online_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert online_orders" ON online_orders;
CREATE POLICY "Authenticated users can insert online_orders" ON online_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update online_orders" ON online_orders;
CREATE POLICY "Authenticated users can update online_orders" ON online_orders FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete online_orders" ON online_orders;
CREATE POLICY "Authenticated users can delete online_orders" ON online_orders FOR DELETE TO authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON online_orders TO authenticated;

CREATE TABLE IF NOT EXISTS online_order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  model          TEXT NOT NULL,
  storage        TEXT,
  grade          TEXT,
  color          TEXT,
  carrier        TEXT,
  quantity       INTEGER NOT NULL,
  unit_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS and grants
ALTER TABLE online_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can query online_order_items" ON online_order_items;
DROP POLICY IF EXISTS "Authenticated users can insert online_order_items" ON online_order_items;
DROP POLICY IF EXISTS "Authenticated users can update online_order_items" ON online_order_items;
DROP POLICY IF EXISTS "Authenticated users can delete online_order_items" ON online_order_items;

DROP POLICY IF EXISTS "Authenticated users can query online_order_items" ON online_order_items;
CREATE POLICY "Authenticated users can query online_order_items" ON online_order_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert online_order_items" ON online_order_items;
CREATE POLICY "Authenticated users can insert online_order_items" ON online_order_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update online_order_items" ON online_order_items;
CREATE POLICY "Authenticated users can update online_order_items" ON online_order_items FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete online_order_items" ON online_order_items;
CREATE POLICY "Authenticated users can delete online_order_items" ON online_order_items FOR DELETE TO authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON online_order_items TO authenticated;

-- Add online_order_id to inventory_items to track which item was sold in which online order
ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS online_order_id UUID REFERENCES online_orders(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS online_order_item_id UUID REFERENCES online_order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_online_order_id ON inventory_items(online_order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_online_order_item_id ON inventory_items(online_order_item_id);
