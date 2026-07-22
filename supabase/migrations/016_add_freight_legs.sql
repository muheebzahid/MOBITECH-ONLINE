-- ============================================================
-- MIGRATION: 016_add_freight_legs.sql
-- Add usa_to_usa_cost and usa_to_dxb_cost columns to shipments
-- ============================================================

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS usa_to_usa_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS usa_to_dxb_cost NUMERIC(12,2) DEFAULT 0;
