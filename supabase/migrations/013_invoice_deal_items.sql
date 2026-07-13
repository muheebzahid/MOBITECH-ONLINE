-- ============================================================
-- MIGRATION: 013_invoice_deal_items.sql
-- Add deal_item_id to invoice_line_items for tracking specific SKUs
-- ============================================================

ALTER TABLE invoice_line_items 
ADD COLUMN deal_item_id UUID REFERENCES deal_items(id) ON DELETE SET NULL;

-- Create an index to improve lookup performance for SKU tracking
CREATE INDEX idx_invoice_line_items_deal_item_id ON invoice_line_items(deal_item_id);
