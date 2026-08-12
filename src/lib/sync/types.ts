export interface DealDiscoveryRequest {
  dealIds: string[]
}

export interface DealDependency {
  type: 'SHARED_SHIPMENT' | 'SHARED_INVOICE' | 'SHARED_ORDER'
  selected_deal_id: string
  required_deal_id: string
  required_deal_number?: string
  reference_id: string
  reference_number?: string
  reason: string
}

export interface DiscoveryWarning {
  type: string
  message: string
  details?: any
}

export interface DealFileReference {
  type: 'INVOICE_PDF' | 'SHIPMENT_DOCUMENT'
  url: string
  reference_id: string
}

export interface DealDiscoveryPackage {
  deals: any[]
  deal_items: any[]
  deal_status_history: any[]
  deal_edit_history: any[]
  shipments: any[]
  shipment_deals: any[]
  shipment_documents: any[]
  invoices: any[]
  invoice_line_items: any[]
  clients: any[]
  payments: any[]
  inventory_items: any[]
  inventory_history: any[]
  online_orders: any[]
  online_order_items: any[]
}

export interface DealPackageCounts {
  deals: number
  deal_items: number
  deal_status_history: number
  deal_edit_history: number
  shipments: number
  shipment_deals: number
  shipment_documents: number
  invoices: number
  invoice_line_items: number
  clients: number
  payments: number
  inventory_items: number
  inventory_history: number
  online_orders: number
  online_order_items: number
  file_references: number
  required_dependencies: number
  total_records: number
}

export interface DealDiscoveryResponse {
  success: boolean
  package?: DealDiscoveryPackage
  counts?: DealPackageCounts
  required_dependencies?: DealDependency[]
  warnings?: DiscoveryWarning[]
  file_references?: DealFileReference[]
  estimated_payload_bytes?: number
  error?: string
}

// ----------------------------------------------------
// SYNC MANIFEST
// ----------------------------------------------------

export type SyncReadinessStatus = 'READY' | 'READY_WITH_WARNINGS' | 'BLOCKED'

export interface SyncManifestRecord {
  table: string
  id: string
}

export interface SyncManifestIssue {
  dealId?: string
  dealNumber?: string
  type?: string
  module: string
  sourceTable: string
  recordId: string
  field?: string
  currentValue?: any
  expectedValue?: any
  severity: 'WARNING' | 'ERROR'
  blocking?: boolean
  reason: string
  actionLabel?: string
  actionRoute?: string
}

export interface SyncManifestFile {
  sourceTable: string
  sourceRecordId: string
  parentRecordId?: string
  bucket: string
  objectPath: string
  filename?: string
  required: boolean
  localReferencePresent: boolean
  status: 'REFERENCE_FOUND' | 'MISSING_REFERENCE' | 'UNVERIFIED'
}

export interface RequiredRelatedDeal {
  selected_deal_id: string
  required_deal_id: string
  required_deal_number?: string
  dependency_type: 'SHARED_SHIPMENT' | 'SHARED_INVOICE' | 'SHARED_ORDER'
  reference_id: string
  reference_number?: string
  reason: string
}

export interface SyncManifestCounts {
  records: DealPackageCounts
  issues: number
  blocking_issues: number
  warnings: number
  missing_files: number
}

export interface SyncManifest {
  status: SyncReadinessStatus
  counts: SyncManifestCounts
  required_related_deals: RequiredRelatedDeal[]
  issues: SyncManifestIssue[]
  files: SyncManifestFile[]
  estimated_payload_bytes: number
}

export interface ValidationResult {
  issues: SyncManifestIssue[]
  files: SyncManifestFile[]
}

// ----------------------------------------------------
// PHASE 2B: PREFLIGHT
// ----------------------------------------------------

export type PreflightAction = 'CREATE' | 'UPDATE' | 'SKIP' | 'CONFLICT' | 'BLOCKED'
export type FilePreflightAction = 'EXISTS_ONLINE_IDENTICAL' | 'MISSING_ONLINE' | 'EXISTS_ONLINE_DIFFERENT' | 'UNVERIFIED' | 'BLOCKED'

export interface PreflightRecordResult {
  table: string
  record_id: string
  action: PreflightAction
  local_checksum: string | null
  online_checksum: string | null
  last_synced_online_checksum: string | null
  reason?: string
}

export interface PreflightFileResult extends SyncManifestFile {
  online_status: FilePreflightAction
}

export interface PreflightSummary {
  create: number
  update: number
  skip: number
  conflict: number
  blocked: number
}

export interface PreflightResponse {
  success: boolean
  status: 'READY' | 'READY_WITH_WARNINGS' | 'BLOCKED' | 'CONFLICT'
  summary: PreflightSummary
  records: PreflightRecordResult[]
  files: PreflightFileResult[]
  required_related_deals: RequiredRelatedDeal[]
  issues: SyncManifestIssue[]
  estimated_payload_bytes: number
  error?: string
}
