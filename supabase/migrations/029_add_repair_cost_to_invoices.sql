-- ============================================================
-- MIGRATION: 029_add_repair_cost_to_invoices.sql
-- Add repair_cost to invoices and invoice_line_items
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS repair_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS repair_cost NUMERIC(12,2) NOT NULL DEFAULT 0;
