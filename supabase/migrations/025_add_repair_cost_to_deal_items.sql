-- ============================================================
-- MIGRATION: 025_add_repair_cost_to_deal_items.sql
-- Add repair_cost to deal_items (SKU)
-- ============================================================

ALTER TABLE deal_items ADD COLUMN IF NOT EXISTS repair_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
