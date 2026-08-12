BEGIN;

-- ==========================================
-- PHASE 1: LOCAL SYNC TRACKING FOUNDATION
-- ==========================================

-- 1. ENUMS
CREATE TYPE public.sync_job_status AS ENUM ('PENDING', 'DISCOVERING', 'VALIDATING', 'BLOCKED', 'READY', 'SYNCING', 'SUCCESS', 'FAILED', 'CONFLICT', 'CANCELLED', 'PARTIAL');
CREATE TYPE public.sync_job_type AS ENUM ('INITIAL', 'INCREMENTAL', 'RETRY');
CREATE TYPE public.sync_inclusion_reason AS ENUM ('USER_SELECTED', 'SHARED_INVOICE', 'SHARED_SHIPMENT', 'OTHER_DEPENDENCY');
CREATE TYPE public.sync_operation AS ENUM ('CREATE', 'UPDATE', 'SKIP', 'CONFLICT', 'BLOCKED', 'UNCHECKED');
CREATE TYPE public.sync_validation_status AS ENUM ('PENDING', 'VALID', 'WARNING', 'BLOCKED', 'CONFLICT', 'FAILED');
CREATE TYPE public.sync_file_status AS ENUM ('DISCOVERED', 'VALIDATED', 'EXISTS_ONLINE', 'UPLOADING', 'UPLOADED', 'REFERENCED', 'FAILED', 'CLEANUP_PENDING', 'CLEANED_UP');
CREATE TYPE public.sync_resolution AS ENUM ('UNRESOLVED', 'KEEP_ONLINE', 'SKIP_LOCAL', 'KEEP_LOCAL', 'CANCEL_PACKAGE');

-- 2. TABLES
-- Table: sync_jobs
CREATE TABLE public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  status public.sync_job_status not null default 'PENDING',
  sync_type public.sync_job_type not null default 'INITIAL',
  destination_project_id text not null,
  destination_environment text not null default 'PRODUCTION',
  selected_deal_count integer not null default 0 CHECK (selected_deal_count >= 0),
  records_discovered integer not null default 0 CHECK (records_discovered >= 0),
  records_created integer not null default 0 CHECK (records_created >= 0),
  records_updated integer not null default 0 CHECK (records_updated >= 0),
  records_skipped integer not null default 0 CHECK (records_skipped >= 0),
  records_blocked integer not null default 0 CHECK (records_blocked >= 0),
  conflicts_count integer not null default 0 CHECK (conflicts_count >= 0),
  files_discovered integer not null default 0 CHECK (files_discovered >= 0),
  files_uploaded integer not null default 0 CHECK (files_uploaded >= 0),
  files_reused integer not null default 0 CHECK (files_reused >= 0),
  files_failed integer not null default 0 CHECK (files_failed >= 0),
  error_summary jsonb,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- Table: sync_job_deals
CREATE TABLE public.sync_job_deals (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid not null references public.sync_jobs(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  deal_number_snapshot text not null,
  inclusion_reason public.sync_inclusion_reason not null,
  is_user_selected boolean not null default false,
  is_required_dependency boolean not null default false,
  package_status text,
  created_at timestamptz not null default now(),
  -- Unique Constraint
  UNIQUE(sync_job_id, deal_id)
);

-- Table: sync_job_records
CREATE TABLE public.sync_job_records (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid not null references public.sync_jobs(id) on delete cascade,
  source_table text not null,
  source_record_id uuid not null,
  parent_deal_id uuid references public.deals(id) on delete set null,
  operation public.sync_operation not null default 'UNCHECKED',
  validation_status public.sync_validation_status not null default 'PENDING',
  local_checksum text,
  last_synced_checksum text,
  online_checksum text,
  error_category text,
  error_code text,
  error_details jsonb,
  record_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Unique Constraint
  UNIQUE(sync_job_id, source_table, source_record_id)
);

-- Table: record_sync_state
CREATE TABLE public.record_sync_state (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_record_id uuid not null,
  last_synced_local_checksum text not null,
  last_synced_online_checksum text not null,
  last_synced_at timestamptz not null,
  last_sync_job_id uuid references public.sync_jobs(id) on delete set null,
  destination_project_id text not null,
  source_system text not null default 'LOCAL_MASTER',
  sync_version integer not null default 1 CHECK (sync_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Unique Constraint
  UNIQUE(source_table, source_record_id, destination_project_id)
);

-- Table: sync_job_files
CREATE TABLE public.sync_job_files (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid not null references public.sync_jobs(id) on delete cascade,
  source_table text not null,
  source_record_id uuid not null,
  parent_record_id uuid,
  local_bucket text,
  local_object_path text,
  cloud_bucket text,
  cloud_object_path text,
  file_name text,
  mime_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  sha256_checksum text,
  status public.sync_file_status not null default 'DISCOVERED',
  was_uploaded_by_this_job boolean not null default false,
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Unique Constraint
  UNIQUE(sync_job_id, source_table, source_record_id, cloud_object_path)
);

-- Table: sync_conflicts
CREATE TABLE public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid not null references public.sync_jobs(id) on delete cascade,
  source_table text not null,
  source_record_id uuid not null,
  field_name text,
  local_value jsonb,
  last_synced_value jsonb,
  online_value jsonb,
  resolution public.sync_resolution not null default 'UNRESOLVED',
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3. INDEXES
CREATE INDEX idx_sync_jobs_status ON public.sync_jobs(status);
CREATE INDEX idx_sync_jobs_started_at ON public.sync_jobs(started_at);
CREATE INDEX idx_sync_job_deals_job ON public.sync_job_deals(sync_job_id);
CREATE INDEX idx_sync_job_deals_deal ON public.sync_job_deals(deal_id);
CREATE INDEX idx_sync_job_records_job ON public.sync_job_records(sync_job_id);
CREATE INDEX idx_sync_job_records_source ON public.sync_job_records(source_table, source_record_id);
CREATE INDEX idx_record_sync_state_source ON public.record_sync_state(source_table, source_record_id);
CREATE INDEX idx_sync_job_files_job ON public.sync_job_files(sync_job_id);
CREATE INDEX idx_sync_conflicts_job ON public.sync_conflicts(sync_job_id);

CREATE UNIQUE INDEX uq_sync_job_files_local_source
ON public.sync_job_files (
  sync_job_id,
  source_table,
  source_record_id,
  local_bucket,
  local_object_path
)
WHERE local_object_path IS NOT NULL;

-- 4. TIMESTAMPS
CREATE TRIGGER sync_jobs_updated_at BEFORE UPDATE ON public.sync_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER sync_job_records_updated_at BEFORE UPDATE ON public.sync_job_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER record_sync_state_updated_at BEFORE UPDATE ON public.record_sync_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER sync_job_files_updated_at BEFORE UPDATE ON public.sync_job_files FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 5. FUNCTION & RLS
CREATE FUNCTION public.is_sync_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'SUPER_ADMIN'::public.app_role
  ) AND auth.uid() IS NOT NULL;
$$;

-- Secure Function
REVOKE ALL ON FUNCTION public.is_sync_super_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sync_super_admin() TO authenticated, service_role;

-- Secure Tables
REVOKE ALL ON TABLE public.sync_jobs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sync_job_deals FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sync_job_records FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.record_sync_state FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sync_job_files FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.sync_conflicts FROM PUBLIC, anon;

-- Grant Authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_job_deals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_job_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.record_sync_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_job_files TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sync_conflicts TO authenticated;

-- Grant Service Role
GRANT ALL ON TABLE public.sync_jobs TO service_role;
GRANT ALL ON TABLE public.sync_job_deals TO service_role;
GRANT ALL ON TABLE public.sync_job_records TO service_role;
GRANT ALL ON TABLE public.record_sync_state TO service_role;
GRANT ALL ON TABLE public.sync_job_files TO service_role;
GRANT ALL ON TABLE public.sync_conflicts TO service_role;

-- Enable RLS
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_job_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_job_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_job_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

-- Apply RLS Policies
CREATE POLICY "SUPER_ADMIN all access sync_jobs" ON public.sync_jobs FOR ALL TO authenticated USING (public.is_sync_super_admin()) WITH CHECK (public.is_sync_super_admin());
CREATE POLICY "SUPER_ADMIN all access sync_job_deals" ON public.sync_job_deals FOR ALL TO authenticated USING (public.is_sync_super_admin()) WITH CHECK (public.is_sync_super_admin());
CREATE POLICY "SUPER_ADMIN all access sync_job_records" ON public.sync_job_records FOR ALL TO authenticated USING (public.is_sync_super_admin()) WITH CHECK (public.is_sync_super_admin());
CREATE POLICY "SUPER_ADMIN all access record_sync_state" ON public.record_sync_state FOR ALL TO authenticated USING (public.is_sync_super_admin()) WITH CHECK (public.is_sync_super_admin());
CREATE POLICY "SUPER_ADMIN all access sync_job_files" ON public.sync_job_files FOR ALL TO authenticated USING (public.is_sync_super_admin()) WITH CHECK (public.is_sync_super_admin());
CREATE POLICY "SUPER_ADMIN all access sync_conflicts" ON public.sync_conflicts FOR ALL TO authenticated USING (public.is_sync_super_admin()) WITH CHECK (public.is_sync_super_admin());

COMMIT;
