/**
 * Shared configuration for the full-mirror sync system.
 * Defines all business tables, their FK-safe processing order,
 * display metadata for the audit UI, and auth-user field sanitization.
 *
 * IMPORTANT: The local/master ERP is NEVER modified by the sync system.
 * All writes go to the online ERP only.
 */

export interface SyncTableConfig {
  table: string
  displayName: string
  module: string
  /** FK-safe upsert order (lower = process first). Deletions run in reverse. */
  upsertOrder: number
  /** Human-readable identifier for the record in audit UI */
  identifier: (r: any) => string
  /** Link to view the record in the dashboard */
  href: (r: any) => string
  /** Fields referencing auth.users that must be sanitized before cloud upsert */
  authUserFields?: string[]
  /** Fields containing file URLs that may need cloud upload */
  fileUrlFields?: string[]
  /** Fields to exclude from diff comparison (e.g. auto-generated timestamps) */
  compareExcludeFields?: string[]
  /** PostgreSQL GENERATED ALWAYS columns — must be stripped from upsert payloads */
  generatedColumns?: string[]
}

/**
 * All business tables that must be mirrored from local → online.
 * Ordered by foreign-key dependencies (parents first for upserts).
 *
 * EXCLUDED from sync (auth/system tables):
 *  - companies, roles, user_profiles, user_roles (different auth pools)
 *  - audit_logs (environment-specific)
 *  - sync_jobs, sync_job_deals, sync_job_records, record_sync_state,
 *    sync_job_files, sync_conflicts, sync_execution_receipts (sync engine internals)
 *  - deal_documents (legacy, unused)
 */
export const SYNC_TABLES: SyncTableConfig[] = [
  // ── Tier 0: Independent / root tables ──────────────────────────
  {
    table: 'clients',
    displayName: 'Clients / Accounts',
    module: 'clients',
    upsertOrder: 1,
    identifier: (r) => r.name || r.id,
    href: (r) => `/dashboard/clients/${r.id}`,
  },
  {
    table: 'deals',
    displayName: 'Deals',
    module: 'deals',
    upsertOrder: 2,
    identifier: (r) => r.deal_number || r.id,
    href: (r) => `/dashboard/deals/${r.id}`,
    authUserFields: ['created_by'],
  },
  {
    table: 'shipments',
    displayName: 'Shipments',
    module: 'logistics',
    upsertOrder: 3,
    identifier: (r) => r.shipment_number || r.id,
    href: (r) => `/dashboard/logistics/${r.id}`,
    authUserFields: ['created_by'],
    generatedColumns: ['total_logistics_cost'],
  },
  {
    table: 'online_orders',
    displayName: 'Online Orders',
    module: 'online_sales',
    upsertOrder: 4,
    identifier: (r) => r.order_number || r.id,
    href: (r) => `/dashboard/online-sales`,
  },
  {
    table: 'partners',
    displayName: 'Partners',
    module: 'partners',
    upsertOrder: 5,
    identifier: (r) => r.name || r.id,
    href: (r) => `/dashboard/partners`,
  },
  {
    table: 'treasury_settings',
    displayName: 'Treasury Settings',
    module: 'treasury',
    upsertOrder: 6,
    identifier: (r) => r.account_name || r.id,
    href: (r) => `/dashboard/finance`,
  },

  // ── Tier 1: First-level children ──────────────────────────────
  {
    table: 'deal_items',
    displayName: 'Deal Items',
    module: 'deals',
    upsertOrder: 10,
    identifier: (r) => `${r.model || ''} ${r.storage || ''}`.trim() || r.id,
    href: (r) => `/dashboard/deals/${r.deal_id}`,
  },
  {
    table: 'deal_status_history',
    displayName: 'Deal Status Logs',
    module: 'deals',
    upsertOrder: 11,
    identifier: (r) => `${r.old_status || '?'} → ${r.new_status || '?'}`,
    href: (r) => `/dashboard/deals/${r.deal_id}`,
    authUserFields: ['changed_by'],
  },
  {
    table: 'deal_edit_history',
    displayName: 'Deal Edit Logs',
    module: 'deals',
    upsertOrder: 12,
    identifier: (r) => r.id,
    href: (r) => `/dashboard/deals/${r.deal_id}`,
    authUserFields: ['edited_by'],
  },
  {
    table: 'shipment_deals',
    displayName: 'Shipment–Deal Links',
    module: 'logistics',
    upsertOrder: 13,
    identifier: (r) => r.id,
    href: (r) => `/dashboard/logistics/${r.shipment_id}`,
  },
  {
    table: 'shipment_documents',
    displayName: 'Shipment Documents',
    module: 'logistics',
    upsertOrder: 14,
    identifier: (r) => r.name || r.id,
    href: (r) => `/dashboard/logistics/${r.shipment_id}`,
    fileUrlFields: ['file_url'],
  },
  {
    table: 'invoices',
    displayName: 'Sales Invoices',
    module: 'invoices',
    upsertOrder: 15,
    identifier: (r) => r.invoice_number || r.id,
    href: (r) => `/dashboard/sales/${r.id}`,
    fileUrlFields: ['pdf_url'],
    authUserFields: ['created_by'],
  },
  {
    table: 'online_order_items',
    displayName: 'Online Order Items',
    module: 'online_sales',
    upsertOrder: 16,
    identifier: (r) => r.title || r.sku || r.id,
    href: (r) => `/dashboard/online-sales`,
  },
  {
    table: 'partner_transactions',
    displayName: 'Partner Transactions',
    module: 'partners',
    upsertOrder: 17,
    identifier: (r) => `${r.type || ''} $${r.amount || 0}`,
    href: (r) => `/dashboard/partners`,
  },

  // ── Tier 2: Second-level children ─────────────────────────────
  {
    table: 'invoice_line_items',
    displayName: 'Invoice Line Items',
    module: 'invoices',
    upsertOrder: 20,
    identifier: (r) => r.description || r.id,
    href: (r) => `/dashboard/sales/${r.invoice_id}`,
    generatedColumns: ['total_price'],
  },
  {
    table: 'payments',
    displayName: 'Payments',
    module: 'payments',
    upsertOrder: 21,
    identifier: (r) => `$${Number(r.amount || 0).toLocaleString()}`,
    href: (r) => `/dashboard/sales/${r.invoice_id}`,
    authUserFields: ['logged_by'],
  },
  {
    table: 'inventory_items',
    displayName: 'Inventory Items',
    module: 'inventory',
    upsertOrder: 22,
    identifier: (r) => r.imei || r.sku || r.model || r.id,
    href: (r) => `/dashboard/inventory`,
    generatedColumns: ['total_cost'],
  },

  // ── Tier 3: Third-level children ──────────────────────────────
  {
    table: 'inventory_history',
    displayName: 'Inventory History',
    module: 'inventory',
    upsertOrder: 30,
    identifier: (r) => `${r.previous_status || '?'} → ${r.new_status || '?'}`,
    href: (r) => `/dashboard/inventory`,
    authUserFields: ['changed_by'],
  },

  // ── Tier 4: Standalone finance / treasury ─────────────────────
  {
    table: 'operating_expenses',
    displayName: 'Operating Expenses',
    module: 'expenses',
    upsertOrder: 40,
    identifier: (r) => r.description || r.category || r.id,
    href: (r) => `/dashboard/accounting`,
    authUserFields: ['logged_by'],
  },
  {
    table: 'wire_transfers',
    displayName: 'Wire Transfers',
    module: 'treasury',
    upsertOrder: 41,
    identifier: (r) => r.reference || r.id,
    href: (r) => `/dashboard/finance`,
  },
  {
    table: 'repayments',
    displayName: 'Repayments',
    module: 'treasury',
    upsertOrder: 42,
    identifier: (r) => `$${Number(r.amount || 0).toLocaleString()}`,
    href: (r) => `/dashboard/finance`,
    authUserFields: ['logged_by'],
  },
  {
    table: 'treasury_transactions',
    displayName: 'Treasury Settlements',
    module: 'treasury',
    upsertOrder: 43,
    identifier: (r) => `${r.transaction_type || ''} ${r.month_cycle || ''}`.trim() || r.id,
    href: (r) => `/dashboard/finance`,
  },
]

/** All distinct module names, in display order */
export const SYNC_MODULES = [
  { key: 'deals', label: 'Deals' },
  { key: 'clients', label: 'Clients / Accounts' },
  { key: 'invoices', label: 'Sales & Invoices' },
  { key: 'payments', label: 'Payments' },
  { key: 'logistics', label: 'Logistics & Shipments' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'online_sales', label: 'Online Sales' },
  { key: 'expenses', label: 'Operating Expenses' },
  { key: 'partners', label: 'Partners' },
  { key: 'treasury', label: 'Treasury' },
] as const

/** Fields always excluded from diff comparison */
export const ALWAYS_EXCLUDE_FIELDS = ['updated_at', 'created_at', 'synced_to_online_at', 'last_synced_at']
