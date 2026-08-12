import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOnlineClient } from '@/lib/supabase/online-server'
import { getUserRole } from '@/lib/admin/actions'

export const dynamic = 'force-dynamic'

function formatDiff(local: any, online: any, fields: { key: string; label: string; fmt?: (v: any) => string }[]): string {
  if (!online) {
    return 'Entire Record Missing in Online Cloud ERP (Not created yet)'
  }

  const diffs: string[] = []
  for (const f of fields) {
    const locVal = local[f.key]
    const onlVal = online[f.key]

    const strLoc = f.fmt ? f.fmt(locVal) : String(locVal ?? '—')
    const strOnl = f.fmt ? f.fmt(onlVal) : String(onlVal ?? '—')

    if (String(locVal ?? '').trim() !== String(onlVal ?? '').trim()) {
      diffs.push(`${f.label}: ${strLoc} (Local) vs ${strOnl} (Cloud)`)
    }
  }

  if (diffs.length === 0) {
    return 'Updated locally with newer timestamp'
  }

  return diffs.join(' | ')
}

export async function GET() {
  try {
    const role = await getUserRole()
    if (role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized: Super Admin access required' }, { status: 401 })
    }

    const localSupabase = await createClient()
    const onlineSupabase = createOnlineClient()

    // 1. Fetch Local Records
    const [
      { data: localDeals },
      { data: localClients },
      { data: localInvoices },
      { data: localShipments },
      { data: localPayments },
      { data: localInventory },
      { data: localOnlineOrders },
      { data: localExpenses }
    ] = await Promise.all([
      localSupabase.from('deals').select('id, deal_number, supplier, model, quantity, total_commitment, status, updated_at'),
      localSupabase.from('clients').select('id, name, email, phone, address, updated_at'),
      localSupabase.from('invoices').select('id, invoice_number, customer_name, total_amount, balance_due, status, updated_at'),
      localSupabase.from('shipments').select('id, shipment_number, status, freight_cost, duty_amount, updated_at'),
      localSupabase.from('payments').select('id, invoice_id, amount, payment_date, payment_method, reference_number'),
      localSupabase.from('inventory_items').select('id, deal_id, imei, model, location, status, unit_cost, updated_at'),
      localSupabase.from('online_orders').select('id, order_number, platform, total_amount, status, updated_at'),
      localSupabase.from('operating_expenses').select('id, category, description, amount, expense_date, updated_at')
    ])

    // 2. Fetch Online Records with functional fields for diffing
    const [
      { data: onlineDeals },
      { data: onlineClients },
      { data: onlineInvoices },
      { data: onlineShipments },
      { data: onlinePayments },
      { data: onlineInventory },
      { data: onlineOnlineOrders },
      { data: onlineExpenses }
    ] = await Promise.all([
      onlineSupabase.from('deals').select('id, deal_number, supplier, model, quantity, total_commitment, status, updated_at'),
      onlineSupabase.from('clients').select('id, name, email, phone, address, updated_at'),
      onlineSupabase.from('invoices').select('id, invoice_number, customer_name, total_amount, balance_due, status, updated_at'),
      onlineSupabase.from('shipments').select('id, shipment_number, status, freight_cost, duty_amount, updated_at'),
      onlineSupabase.from('payments').select('id, invoice_id, amount, payment_date, payment_method, reference_number'),
      onlineSupabase.from('inventory_items').select('id, deal_id, imei, model, location, status, unit_cost, updated_at'),
      onlineSupabase.from('online_orders').select('id, order_number, platform, total_amount, status, updated_at'),
      onlineSupabase.from('operating_expenses').select('id, category, description, amount, expense_date, updated_at')
    ])

    const onlineDealsMap = new Map((onlineDeals || []).map(r => [r.id, r]))
    const onlineClientsMap = new Map((onlineClients || []).map(r => [r.id, r]))
    const onlineInvoicesMap = new Map((onlineInvoices || []).map(r => [r.id, r]))
    const onlineShipmentsMap = new Map((onlineShipments || []).map(r => [r.id, r]))
    const onlinePaymentsMap = new Map((onlinePayments || []).map(r => [r.id, r]))
    const onlineInventoryMap = new Map((onlineInventory || []).map(r => [r.id, r]))
    const onlineOrdersMap = new Map((onlineOnlineOrders || []).map(r => [r.id, r]))
    const onlineExpensesMap = new Map((onlineExpenses || []).map(r => [r.id, r]))

    // Auditor helper with exact diff formatting and href link generation
    const auditModule = (
      localList: any[] = [],
      onlineMap: Map<string, any>,
      getHref: (item: any) => string,
      fieldsToDiff: { key: string; label: string; fmt?: (v: any) => string }[]
    ) => {
      let missing = 0
      let outOfDate = 0
      let synced = 0
      const missingRecords: any[] = []

      for (const item of localList) {
        if (!item.id) continue

        const href = getHref(item)
        const onlineItem = onlineMap.get(item.id)

        if (!onlineItem) {
          missing++
          missingRecords.push({
            ...item,
            issue: 'MISSING_ONLINE',
            diff_detail: formatDiff(item, null, fieldsToDiff),
            href
          })
        } else {
          const itemUpdated = item.updated_at
          const onlineUpdated = onlineItem.updated_at
          const isTimeDiff = itemUpdated && onlineUpdated && new Date(itemUpdated).getTime() > new Date(onlineUpdated).getTime() + 2000

          const diffText = formatDiff(item, onlineItem, fieldsToDiff)
          const hasFieldDiff = diffText !== 'Updated locally with newer timestamp'

          if (isTimeDiff || hasFieldDiff) {
            outOfDate++
            missingRecords.push({
              ...item,
              issue: 'OUT_OF_DATE',
              diff_detail: diffText,
              href
            })
          } else {
            synced++
          }
        }
      }

      return { total: localList.length, missing, outOfDate, synced, items: missingRecords }
    }

    const dealsAudit = auditModule(
      localDeals || [],
      onlineDealsMap,
      item => `/dashboard/deals/${item.id}`,
      [
        { key: 'status', label: 'Status' },
        { key: 'quantity', label: 'Qty' },
        { key: 'total_commitment', label: 'Total Cost', fmt: v => `$${Number(v || 0).toLocaleString()}` },
        { key: 'supplier', label: 'Supplier' }
      ]
    )

    const clientsAudit = auditModule(
      localClients || [],
      onlineClientsMap,
      item => `/dashboard/clients/${item.id}`,
      [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' }
      ]
    )

    const invoicesAudit = auditModule(
      localInvoices || [],
      onlineInvoicesMap,
      item => `/dashboard/sales/${item.id}`,
      [
        { key: 'status', label: 'Status' },
        { key: 'total_amount', label: 'Total Amount', fmt: v => `$${Number(v || 0).toLocaleString()}` },
        { key: 'balance_due', label: 'Balance Due', fmt: v => `$${Number(v || 0).toLocaleString()}` }
      ]
    )

    const shipmentsAudit = auditModule(
      localShipments || [],
      onlineShipmentsMap,
      item => `/dashboard/logistics/${item.id}`,
      [
        { key: 'status', label: 'Status' },
        { key: 'freight_cost', label: 'Freight Cost', fmt: v => `$${Number(v || 0).toLocaleString()}` },
        { key: 'duty_amount', label: 'Duty Amount', fmt: v => `$${Number(v || 0).toLocaleString()}` }
      ]
    )

    const paymentsAudit = auditModule(
      localPayments || [],
      onlinePaymentsMap,
      item => `/dashboard/sales/${item.invoice_id}`,
      [
        { key: 'amount', label: 'Amount', fmt: v => `$${Number(v || 0).toLocaleString()}` },
        { key: 'payment_method', label: 'Method' },
        { key: 'reference_number', label: 'Ref #' }
      ]
    )

    const inventoryAudit = auditModule(
      localInventory || [],
      onlineInventoryMap,
      item => `/dashboard/inventory`,
      [
        { key: 'status', label: 'Status' },
        { key: 'location', label: 'Location' },
        { key: 'unit_cost', label: 'Unit Cost', fmt: v => `$${Number(v || 0).toLocaleString()}` }
      ]
    )

    const ordersAudit = auditModule(
      localOnlineOrders || [],
      onlineOrdersMap,
      item => `/dashboard/online-sales`,
      [
        { key: 'status', label: 'Status' },
        { key: 'total_amount', label: 'Total Amount', fmt: v => `$${Number(v || 0).toLocaleString()}` },
        { key: 'platform', label: 'Platform' }
      ]
    )

    const expensesAudit = auditModule(
      localExpenses || [],
      onlineExpensesMap,
      item => `/dashboard/accounting`,
      [
        { key: 'category', label: 'Category' },
        { key: 'description', label: 'Description' },
        { key: 'amount', label: 'Amount', fmt: v => `$${Number(v || 0).toLocaleString()}` },
        { key: 'expense_date', label: 'Expense Date' }
      ]
    )

    // Map unsynced items back to deal IDs for sync payload execution
    const unsyncedDealIds = new Set<string>()
    for (const d of dealsAudit.items) {
      unsyncedDealIds.add(d.id)
    }

    if (invoicesAudit.items.length > 0) {
      const unsyncedInvIds = invoicesAudit.items.map(i => i.id)
      const { data: invLines } = await localSupabase
        .from('invoice_line_items')
        .select('deal_id')
        .in('invoice_id', unsyncedInvIds)

      if (invLines) {
        for (const line of invLines) {
          if (line.deal_id) unsyncedDealIds.add(line.deal_id)
        }
      }
    }

    for (const invItem of inventoryAudit.items) {
      if (invItem.deal_id) unsyncedDealIds.add(invItem.deal_id)
    }

    const totalLocalRecords =
      dealsAudit.total +
      clientsAudit.total +
      invoicesAudit.total +
      shipmentsAudit.total +
      paymentsAudit.total +
      inventoryAudit.total +
      ordersAudit.total +
      expensesAudit.total

    const totalMissingOnline =
      dealsAudit.missing +
      clientsAudit.missing +
      invoicesAudit.missing +
      shipmentsAudit.missing +
      paymentsAudit.missing +
      inventoryAudit.missing +
      ordersAudit.missing +
      expensesAudit.missing

    const totalOutOfDate =
      dealsAudit.outOfDate +
      clientsAudit.outOfDate +
      invoicesAudit.outOfDate +
      shipmentsAudit.outOfDate +
      paymentsAudit.outOfDate +
      inventoryAudit.outOfDate +
      ordersAudit.outOfDate +
      expensesAudit.outOfDate

    return NextResponse.json({
      success: true,
      audited_at: new Date().toISOString(),
      destination_project_ref: 'aivcmkwclfipntadipec',
      destination_domain: 'the-workflows.com',
      summary: {
        total_local_records: totalLocalRecords,
        total_missing_online: totalMissingOnline,
        total_out_of_date: totalOutOfDate,
        total_synced_online: totalLocalRecords - totalMissingOnline - totalOutOfDate,
        unsynced_deal_count: unsyncedDealIds.size
      },
      unsynced_deal_ids: Array.from(unsyncedDealIds),
      modules: {
        deals: dealsAudit,
        clients: clientsAudit,
        invoices: invoicesAudit,
        shipments: shipmentsAudit,
        payments: paymentsAudit,
        inventory: inventoryAudit,
        online_orders: ordersAudit,
        expenses: expensesAudit
      }
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Internal audit error' }, { status: 500 })
  }
}
