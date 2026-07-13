-- =============================================
-- MOBITECH ERP - DEALS MODULE SCHEMA
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. DEALS TABLE (The core record for everything)
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),

  -- Deal Identity
  deal_number text not null unique, -- e.g. ATT-2026-0001
  supplier text not null,           -- 'ATT' | 'ECOATM' | 'OTHER'
  auction_platform text not null,   -- 'BSTOCK' | 'ECOATM' | 'DIRECT'

  -- Lot Details
  model text not null,              -- e.g. iPhone 13
  storage text,                     -- e.g. 128GB
  grade text,                       -- e.g. CT, B, C
  color text,
  carrier text,                     -- e.g. AT&T, Unlocked
  quantity integer not null,

  -- Financials (USD)
  unit_cost numeric(12,2) not null,
  total_cost numeric(12,2) not null,   -- unit_cost * quantity
  auction_fee numeric(12,2) default 0, -- B-Stock 2% fee
  other_fees numeric(12,2) default 0,
  total_commitment numeric(12,2) not null, -- total_cost + fees

  -- Funding
  funding_source text not null default 'AMEX', -- 'AMEX' | 'CASH_POOL' | 'MIXED'
  amex_amount numeric(12,2) default 0,
  cash_amount numeric(12,2) default 0,

  -- Amex Tracking
  amex_statement_date date,         -- Usually 12th of month
  amex_payment_date date,           -- Date SB paid off the card
  cashback_eligible boolean default false,
  cashback_amount numeric(12,2) default 0,
  cashback_received boolean default false,

  -- Cash Pool Tracking
  cash_finance_rate numeric(5,4) default 0.0583, -- 0.583% monthly
  cash_days_deployed integer default 0,
  cash_finance_cost numeric(12,2) default 0,

  -- Status & Lifecycle
  status text not null default 'AUCTION_WON',
  auction_won_date timestamptz default now(),
  payment_link_date timestamptz,
  payment_date timestamptz,
  pickup_ready_date timestamptz,
  shipped_usa_date timestamptz,
  arrived_miami_date timestamptz,
  shipped_dubai_date timestamptz,
  arrived_dubai_date timestamptz,
  received_mobitech_date timestamptz,
  deal_closed_date timestamptz,

  -- Internal Billing
  turbo_invoice_amount numeric(12,2), -- Amount billed to Mobitech by Turbo
  turbo_invoice_paid boolean default false,
  turbo_invoice_paid_date timestamptz,

  -- Revenue & Profit
  total_revenue numeric(12,2) default 0,
  total_cogs numeric(12,2) default 0,
  gross_profit numeric(12,2) default 0,

  -- Notes & Metadata
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. DEAL STATUS HISTORY (Audit trail for every status change)
create table if not exists deal_status_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  old_status text,
  new_status text not null,
  notes text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz default now()
);

-- 3. DEAL DOCUMENTS (Attach emails, invoices, waybills)
create table if not exists deal_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  document_type text not null, -- 'WINNING_EMAIL' | 'PAYMENT_LINK' | 'PAYMENT_RECEIPT' | 'SHIPPING_DOC' | 'COMMERCIAL_INVOICE' | 'OTHER'
  file_name text not null,
  file_url text,
  notes text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz default now()
);

-- Enable RLS
alter table deals enable row level security;
alter table deal_status_history enable row level security;
alter table deal_documents enable row level security;

-- RLS Policies
create policy "Authenticated users can view deals"
  on deals for select to authenticated using (true);

create policy "Authenticated users can insert deals"
  on deals for insert to authenticated with check (true);

create policy "Authenticated users can update deals"
  on deals for update to authenticated using (true);

create policy "Authenticated users can view deal history"
  on deal_status_history for select to authenticated using (true);

create policy "Authenticated users can insert deal history"
  on deal_status_history for insert to authenticated with check (true);

create policy "Authenticated users can view deal documents"
  on deal_documents for select to authenticated using (true);

create policy "Authenticated users can insert deal documents"
  on deal_documents for insert to authenticated with check (true);

-- Function to auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger deals_updated_at
  before update on deals
  for each row execute function update_updated_at();

-- =============================================
-- DONE! Deals module schema is ready.
-- =============================================
