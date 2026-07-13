-- =============================================
-- DEAL EDIT HISTORY TABLE
-- Run this in Supabase SQL Editor
-- =============================================

create table if not exists deal_edit_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  edited_by uuid references auth.users(id),
  edited_at timestamptz default now(),
  -- Snapshot of what changed
  field_changes jsonb not null, -- [{ field, old_value, new_value }]
  edit_note text
);

alter table deal_edit_history enable row level security;

create policy "Authenticated users can view deal edit history"
  on deal_edit_history for select to authenticated using (true);

create policy "Authenticated users can insert deal edit history"
  on deal_edit_history for insert to authenticated with check (true);
