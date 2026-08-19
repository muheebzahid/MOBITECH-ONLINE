import { DealDiscoveryPackage, SyncManifestIssue, SyncManifestFile, ValidationResult } from './types'

function maskImei(imei?: string): string {
  if (!imei) return 'unknown'
  if (imei.length <= 4) return '***' + imei
  return '***' + imei.slice(-4)
}

export function validateDealPackage(pkg: DealDiscoveryPackage): ValidationResult {
  const issues: SyncManifestIssue[] = []
  const files: SyncManifestFile[] = []

  const dealMap = new Map(pkg.deals.map(d => [d.id, d]))
  const clientMap = new Map(pkg.clients.map(c => [c.id, c]))
  const invoiceMap = new Map(pkg.invoices.map(i => [i.id, i]))
  const itemMap = new Map(pkg.inventory_items.map(i => [i.id, i]))

  for (const deal of pkg.deals) {
    if (!deal.status) {
      issues.push({
        dealId: deal.id, dealNumber: deal.deal_number,
        module: 'Deals', sourceTable: 'deals', recordId: deal.id, field: 'status',
        currentValue: null, expectedValue: 'valid status',
        severity: 'ERROR', blocking: true,
        reason: 'Deal is missing a status.',
        actionLabel: 'Open Deal', actionRoute: '/dashboard/deals/' + deal.id
      })
    }
    if (deal.total_amount < 0) {
      issues.push({
        dealId: deal.id, dealNumber: deal.deal_number,
        module: 'Deals', sourceTable: 'deals', recordId: deal.id, field: 'total_amount',
        currentValue: deal.total_amount, expectedValue: '>= 0',
        severity: 'ERROR', blocking: true,
        reason: 'Deal total amount cannot be negative.',
        actionLabel: 'Open Deal', actionRoute: '/dashboard/deals/' + deal.id
      })
    }
    
    const items = pkg.deal_items.filter(di => di.deal_id === deal.id)
    if (items.length === 0) {
      issues.push({
        dealId: deal.id, dealNumber: deal.deal_number,
        module: 'Deals', sourceTable: 'deal_items', recordId: deal.id, field: 'deal_items',
        severity: 'ERROR', blocking: true,
        reason: 'Deal has no line items.',
        actionLabel: 'Open Deal', actionRoute: '/dashboard/deals/' + deal.id
      })
    }
  }

  for (const ship of pkg.shipments) {
    if (!ship.shipment_number) {
      issues.push({
        module: 'Logistics', sourceTable: 'shipments', recordId: ship.id, field: 'shipment_number',
        severity: 'ERROR', blocking: true,
        reason: 'Shipment is missing a tracking/shipment number.',
        actionLabel: 'Open Shipment', actionRoute: '/dashboard/shipments/' + ship.id
      })
    }
    if (!ship.status) {
      issues.push({
        module: 'Logistics', sourceTable: 'shipments', recordId: ship.id, field: 'status',
        severity: 'ERROR', blocking: true,
        reason: 'Shipment is missing a status.',
        actionLabel: 'Open Shipment', actionRoute: '/dashboard/shipments/' + ship.id
      })
    }
  }

  for (const doc of pkg.shipment_documents) {
    if (doc.file_url) {
      files.push({
        sourceTable: 'shipment_documents', sourceRecordId: doc.id, parentRecordId: doc.shipment_id,
        bucket: 'shipments', objectPath: doc.file_url,
        required: false, localReferencePresent: true, status: 'REFERENCE_FOUND'
      })
    } else {
      issues.push({
        module: 'Logistics', sourceTable: 'shipment_documents', recordId: doc.id, field: 'file_url',
        severity: 'WARNING', blocking: false,
        reason: 'Shipment document entry exists without a file reference.',
        actionLabel: 'Check Shipment', actionRoute: '/dashboard/shipments/' + doc.shipment_id
      })
    }
  }

  for (const inv of pkg.invoices) {
    if (!inv.client_id || !clientMap.has(inv.client_id)) {
      issues.push({
        module: 'Finance', sourceTable: 'invoices', recordId: inv.id, field: 'client_id',
        severity: 'ERROR', blocking: true,
        reason: 'Invoice is missing a valid client relationship.',
        actionLabel: 'Open Invoice', actionRoute: '/dashboard/finance/invoices/' + inv.id
      })
    }
    if (inv.total_amount < 0) {
      issues.push({
        module: 'Finance', sourceTable: 'invoices', recordId: inv.id, field: 'total_amount',
        severity: 'ERROR', blocking: true,
        reason: 'Invoice total amount cannot be negative.',
        actionLabel: 'Open Invoice', actionRoute: '/dashboard/finance/invoices/' + inv.id
      })
    }
    
    const lines = pkg.invoice_line_items.filter(ili => ili.invoice_id === inv.id)
    if (lines.length === 0) {
      issues.push({
        module: 'Finance', sourceTable: 'invoice_line_items', recordId: inv.id, field: 'line_items',
        severity: 'ERROR', blocking: true,
        reason: 'Invoice has no line items.',
        actionLabel: 'Open Invoice', actionRoute: '/dashboard/finance/invoices/' + inv.id
      })
    }

    if (inv.pdf_url) {
      files.push({
        sourceTable: 'invoices', sourceRecordId: inv.id, parentRecordId: inv.id,
        bucket: 'invoices', objectPath: inv.pdf_url,
        required: false, localReferencePresent: true, status: 'REFERENCE_FOUND'
      })
    }
  }

  for (const client of pkg.clients) {
    if (!client.name) {
      issues.push({
        module: 'Sales', sourceTable: 'clients', recordId: client.id, field: 'name',
        severity: 'ERROR', blocking: true,
        reason: 'Client is missing a name.',
        actionLabel: 'Check Client', actionRoute: '/dashboard/clients'
      })
    }
    if (!client.email && !client.phone) {
      issues.push({
        module: 'Sales', sourceTable: 'clients', recordId: client.id, field: 'contact',
        severity: 'WARNING', blocking: false,
        reason: 'Client has no email or phone number.',
        actionLabel: 'Check Client', actionRoute: '/dashboard/clients'
      })
    }
  }

  for (const pay of pkg.payments) {
    if (!pay.invoice_id || !invoiceMap.has(pay.invoice_id)) {
      issues.push({
        module: 'Finance', sourceTable: 'payments', recordId: pay.id, field: 'invoice_id',
        severity: 'ERROR', blocking: true,
        reason: 'Payment has an invalid invoice reference.',
        actionLabel: 'Check Payments', actionRoute: '/dashboard/finance'
      })
    }
    if (pay.amount < 0) {
      issues.push({
        severity: 'ERROR',
        blocking: true,
        type: 'VALIDATION',
        module: 'Finance', sourceTable: 'payments', recordId: pay.id, field: 'amount',
        currentValue: pay.amount, expectedValue: '>= 0',
        reason: 'Payment amount cannot be negative.',
        actionLabel: 'Check Payments', actionRoute: '/dashboard/finance'
      })
    }
  }

  const imeiSet = new Set<string>()
  for (const item of pkg.inventory_items) {
    const deal = dealMap.get(item.deal_id)
    if (!item.status || !item.location) {
      issues.push({
        dealId: item.deal_id, dealNumber: deal?.deal_number,
        module: 'Inventory', sourceTable: 'inventory_items', recordId: item.id, field: 'status/location',
        severity: 'ERROR', blocking: true,
        reason: 'Inventory item is missing status or location.',
        actionLabel: 'Open Inventory', actionRoute: '/dashboard/inventory'
      })
    }
    if (item.imei) {
      if (imeiSet.has(item.imei)) {
        issues.push({
          dealId: item.deal_id, dealNumber: deal?.deal_number,
          module: 'Inventory', sourceTable: 'inventory_items', recordId: item.id, field: 'imei',
          currentValue: maskImei(item.imei),
          severity: 'ERROR', blocking: true,
          reason: 'Duplicate IMEI detected in the sync package.',
          actionLabel: 'Open Inventory', actionRoute: '/dashboard/inventory'
        })
      }
      imeiSet.add(item.imei)
    }
  }

  for (const hist of pkg.inventory_history) {
    if (!itemMap.has(hist.item_id)) {
      issues.push({
        module: 'Inventory', sourceTable: 'inventory_history', recordId: hist.id, field: 'item_id',
        severity: 'ERROR', blocking: true,
        reason: 'Inventory history references an invalid item.',
        actionLabel: 'Open Inventory', actionRoute: '/dashboard/inventory'
      })
    }
  }

  for (const order of pkg.online_orders) {
    if (!order.status) {
      issues.push({
        module: 'Sales', sourceTable: 'online_orders', recordId: order.id, field: 'status',
        severity: 'ERROR', blocking: true,
        reason: 'Online order is missing a status.',
        actionLabel: 'Open Order', actionRoute: '/dashboard/sales/online'
      })
    }
    const oItems = pkg.online_order_items.filter(ooi => ooi.order_id === order.id)
    if (oItems.length === 0) {
      issues.push({
        module: 'Sales', sourceTable: 'online_order_items', recordId: order.id, field: 'items',
        severity: 'ERROR', blocking: true,
        reason: 'Online order has no items.',
        actionLabel: 'Open Order', actionRoute: '/dashboard/sales/online'
      })
    }
  }

  return { issues, files }
}
