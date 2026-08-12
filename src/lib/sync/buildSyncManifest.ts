import { DealDiscoveryPackage, DealDiscoveryResponse, SyncManifest, SyncReadinessStatus, RequiredRelatedDeal } from './types'
import { validateDealPackage } from './validateDealPackage'

export function buildSyncManifest(discoveryResponse: DealDiscoveryResponse): SyncManifest {
  if (!discoveryResponse.success || !discoveryResponse.package || !discoveryResponse.counts) {
    throw new Error(discoveryResponse.error || 'Invalid discovery response')
  }

  const pkg = discoveryResponse.package
  const { issues, files } = validateDealPackage(pkg)

  const required_related_deals: RequiredRelatedDeal[] = (discoveryResponse.required_dependencies || []).map(dep => {
    return {
      selected_deal_id: dep.selected_deal_id,
      required_deal_id: dep.required_deal_id,
      required_deal_number: dep.required_deal_number,
      dependency_type: dep.type,
      reference_id: dep.reference_id,
      reference_number: dep.reference_number,
      reason: dep.reason
    }
  })

  required_related_deals.forEach(req => {
    issues.push({
      dealId: req.selected_deal_id,
      module: 'Dependencies',
      sourceTable: req.dependency_type === 'SHARED_SHIPMENT' ? 'shipments' : req.dependency_type === 'SHARED_INVOICE' ? 'invoices' : 'online_orders',
      recordId: req.reference_id,
      field: 'required_deal',
      severity: 'ERROR',
      blocking: true,
      reason: req.reason,
      actionLabel: req.required_deal_number ? `Open ${req.reference_number || 'Record'} (${req.required_deal_number})` : 'Include Required Related Deal',
      actionRoute: req.dependency_type === 'SHARED_INVOICE' ? `/dashboard/finance/invoices/${req.reference_id}` : req.dependency_type === 'SHARED_SHIPMENT' ? `/dashboard/logistics/${req.reference_id}` : `/dashboard/sales`
    })
  })

  let status: SyncReadinessStatus = 'READY'
  const blockingIssues = issues.filter(i => i.blocking)
  const warnings = issues.filter(i => !i.blocking)

  if (blockingIssues.length > 0) {
    status = 'BLOCKED'
  } else if (warnings.length > 0) {
    status = 'READY_WITH_WARNINGS'
  }

  const missingFiles = files.filter(f => f.status === 'MISSING_REFERENCE').length

  const counts = {
    records: discoveryResponse.counts,
    issues: issues.length,
    blocking_issues: blockingIssues.length,
    warnings: warnings.length,
    missing_files: missingFiles
  }

  return {
    status,
    counts,
    required_related_deals,
    issues,
    files,
    estimated_payload_bytes: discoveryResponse.estimated_payload_bytes || 0
  }
}
