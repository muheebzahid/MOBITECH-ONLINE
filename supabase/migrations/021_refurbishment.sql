-- ============================================================
-- MIGRATION: 007_refurbishment.sql
-- Refurbishment Stages for Inventory Items
-- ============================================================

-- Create the new refurb_stage enum
CREATE TYPE refurb_stage AS ENUM (
  'SEPARATED',
  'HANDED_TO_REFURBISH',
  'QC_DONE',
  'READY_TO_SELL'
);

-- Alter inventory_items table
ALTER TABLE inventory_items
  ADD COLUMN refurb_stage refurb_stage,
  ADD COLUMN repair_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN qc_document_url TEXT;

-- Update the total_cost generated column to include repair_cost
ALTER TABLE inventory_items
  DROP COLUMN IF EXISTS total_cost;

ALTER TABLE inventory_items
  ADD COLUMN total_cost NUMERIC(12,2) GENERATED ALWAYS AS (unit_cost + logistics_cost + repair_cost) STORED;

-- Add policies for new columns if needed (the existing policies should cover all columns implicitly as they allow UPDATE on the table)
