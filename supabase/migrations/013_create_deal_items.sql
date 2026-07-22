-- ============================================================
-- MIGRATION: 013_create_deal_items.sql
-- Create deal_items table and link it to invoice_line_items
-- ============================================================

CREATE TABLE IF NOT EXISTS deal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  storage TEXT,
  grade TEXT,
  color TEXT,
  carrier TEXT,
  quantity INTEGER NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS and grants
ALTER TABLE deal_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_items_select ON deal_items FOR SELECT TO authenticated USING (true);
CREATE POLICY deal_items_insert ON deal_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY deal_items_update ON deal_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY deal_items_delete ON deal_items FOR DELETE TO authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON deal_items TO authenticated;

-- Link to invoice_line_items
ALTER TABLE invoice_line_items 
ADD COLUMN IF NOT EXISTS deal_item_id UUID REFERENCES deal_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_deal_item_id ON invoice_line_items(deal_item_id);
