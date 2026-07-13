-- =============================================
-- MOBITECH ERP - COMPLETE DATABASE SETUP
-- Copy and paste this entire file into the
-- Supabase SQL Editor and click RUN
-- =============================================

-- 1. COMPANIES TABLE
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  address text,
  country text default 'UAE',
  currency text default 'USD',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into companies (name, legal_name, country) values
  ('Mobitech Wireless', 'Mobitech Wireless LLC', 'UAE'),
  ('SB Technology', 'SB Technology LLC', 'UAE'),
  ('Turbo Logistics', 'Turbo Logistics LLC', 'UAE');

-- 2. ROLES TABLE
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz default now()
);

insert into roles (name, description) values
  ('super_admin',       'Full access to all modules'),
  ('purchasing',        'Auctions and purchases only'),
  ('sb_finance',        'Payment and Amex records'),
  ('sb_logistics_usa',  'USA receipt and dispatch'),
  ('turbo_logistics',   'Shipment, import and internal billing'),
  ('mobitech_sales',    'Wholesale and online sales'),
  ('warehouse',         'Receiving, IMEI and stock movement'),
  ('accountant',        'Expenses, closing and reports'),
  ('partner_viewer',    'Partner balances and approved reports');

-- 3. USER PROFILES TABLE (linked to Supabase Auth)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role_id uuid references roles(id),
  company_id uuid references companies(id),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table companies enable row level security;
alter table roles enable row level security;
alter table user_profiles enable row level security;

-- RLS Policies
create policy "Authenticated users can view companies"
  on companies for select to authenticated using (true);

create policy "Authenticated users can view roles"
  on roles for select to authenticated using (true);

create policy "Users can view their own profile"
  on user_profiles for select to authenticated using (auth.uid() = id);

create policy "Super admin can view all profiles"
  on user_profiles for select to authenticated
  using (
    exists (
      select 1 from user_profiles up
      join roles r on up.role_id = r.id
      where up.id = auth.uid() and r.name = 'super_admin'
    )
  );

-- 4. PARTNERS TABLE
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_profile_id uuid references user_profiles(id),
  ownership_percentage numeric(5,2) not null,
  monthly_salary_aed numeric(12,2) default 0,
  is_working_partner boolean default false,
  created_at timestamptz default now()
);

alter table partners enable row level security;

create policy "Authenticated users can view partners"
  on partners for select to authenticated using (true);

-- 5. AUDIT LOG TABLE
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz default now()
);

alter table audit_logs enable row level security;

create policy "Super admin can view audit logs"
  on audit_logs for select to authenticated
  using (
    exists (
      select 1 from user_profiles up
      join roles r on up.role_id = r.id
      where up.id = auth.uid() and r.name = 'super_admin'
    )
  );

-- =============================================
-- 6. CREATE MUHEEB'S PROFILE (Super Admin)
-- =============================================
insert into user_profiles (id, full_name, role_id, company_id)
values (
  '23ee6d50-a842-4d63-9c7f-7580f1e68c2b',
  'Muheeb',
  (select id from roles where name = 'super_admin'),
  (select id from companies where name = 'Mobitech Wireless')
);

-- =============================================
-- 7. INSERT PARTNERS (with Muheeb linked)
-- =============================================
insert into partners (name, user_profile_id, ownership_percentage, monthly_salary_aed, is_working_partner)
values
  (
    'Muheeb',
    '23ee6d50-a842-4d63-9c7f-7580f1e68c2b',
    33.33,
    15000.00,
    true
  ),
  (
    'Beshair',
    null,
    33.33,
    0.00,
    false
  ),
  (
    'Faisal',
    null,
    33.33,
    0.00,
    false
  );

-- =============================================
-- DONE! All tables, policies, and seed data
-- have been created successfully.
-- =============================================
