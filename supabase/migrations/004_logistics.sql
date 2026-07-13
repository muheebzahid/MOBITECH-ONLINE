-- ============================================================
-- MIGRATION: 004_logistics.sql
-- Shipments table + deal linkage
-- ============================================================

-- Shipment status enum
CREATE TYPE shipment_status AS ENUM (
  'PENDING',
  'AT_SB_TECHNOLOGY',
  'SHIPPED_FROM_USA',
  'IN_TRANSIT',
  'ARRIVED_DUBAI',
  'CUSTOMS_CLEARED',
  'AT_TURBO_LOGISTICS',
  'DELIVERED_TO_MOBITECH'
);

-- Shipments master table
CREATE TABLE IF NOT EXISTS shipments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_number       TEXT NOT NULL UNIQUE,

  -- Status
  status                shipment_status NOT NULL DEFAULT 'PENDING',

  -- Leg 1: SB Technology pickup
  pickup_date           DATE,
  pickup_ref            TEXT,
  sb_invoice_number     TEXT,
  sb_fee                NUMERIC(12,2) DEFAULT 0,

  -- Leg 2: Shipped from USA
  shipped_usa_date      DATE,
  carrier               TEXT,
  awb_number            TEXT,
  freight_cost          NUMERIC(12,2) DEFAULT 0,

  -- Leg 3: Arrived Dubai
  arrived_dubai_date    DATE,
  customs_ref           TEXT,

  -- Leg 4: Customs cleared
  customs_cleared_date  DATE,
  duty_amount           NUMERIC(12,2) DEFAULT 0,

  -- Leg 5: Turbo Logistics
  turbo_received_date   DATE,
  turbo_invoice_number  TEXT,
  turbo_fee             NUMERIC(12,2) DEFAULT 0,

  -- Leg 6: Delivered to Mobitech
  delivered_mobitech_date DATE,
  condition_notes       TEXT,

  -- Financials summary (computed)
  total_logistics_cost  NUMERIC(12,2) GENERATED ALWAYS AS (
    COALESCE(sb_fee, 0) + COALESCE(freight_cost, 0) +
    COALESCE(duty_amount, 0) + COALESCE(turbo_fee, 0)
  ) STORED,

  notes                 TEXT,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sequence for shipment numbers
CREATE SEQUENCE IF NOT EXISTS shipment_number_seq START 1;

-- Auto-generate shipment number
CREATE OR REPLACE FUNCTION generate_shipment_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.shipment_number := 'SHP-' || to_char(now(), 'YYYY') || '-' || LPAD(nextval('shipment_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_shipment_number
  BEFORE INSERT ON shipments
  FOR EACH ROW
  WHEN (NEW.shipment_number IS NULL OR NEW.shipment_number = '')
  EXECUTE FUNCTION generate_shipment_number();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_shipments_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shipments_updated_at
  BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_shipments_updated_at();

-- Deal ↔ Shipment link table
CREATE TABLE IF NOT EXISTS shipment_deals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id  UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  deal_id      UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shipment_id, deal_id)
);

-- RLS policies
ALTER TABLE shipments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can manage shipments"
  ON shipments FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users can manage shipment_deals"
  ON shipment_deals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_shipment_deals_shipment ON shipment_deals(shipment_id);
CREATE INDEX idx_shipment_deals_deal     ON shipment_deals(deal_id);
CREATE INDEX idx_shipments_status        ON shipments(status);
