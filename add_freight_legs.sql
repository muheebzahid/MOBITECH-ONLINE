-- Alter shipments table to add the separate freight cost columns
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS usa_to_usa_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS usa_to_dxb_cost NUMERIC(12,2) DEFAULT 0;
