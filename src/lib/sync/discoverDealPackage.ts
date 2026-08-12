import { createClient } from '@/lib/supabase/server'
import {
  DealDiscoveryRequest,
  DealDiscoveryResponse,
  DealDiscoveryPackage,
  DealDependency,
  DiscoveryWarning,
  DealFileReference
} from './types'

export async function discoverDealPackage(req: DealDiscoveryRequest, supabase: any): Promise<DealDiscoveryResponse> {
  if (!req.dealIds || req.dealIds.length === 0) {
    return { success: false, error: 'No Deal IDs provided' }
  }

  const dealIds = req.dealIds
  const selectedDealIds = new Set(dealIds)

  const pkg: DealDiscoveryPackage = {
    deals: [],
    deal_items: [],
    deal_status_history: [],
    deal_edit_history: [],
    shipments: [],
    shipment_deals: [],
    shipment_documents: [],
    invoices: [],
    invoice_line_items: [],
    clients: [],
    payments: [],
    inventory_items: [],
    inventory_history: [],
    online_orders: [],
    online_order_items: []
  }

  const dependencies: DealDependency[] = []
  const warnings: DiscoveryWarning[] = []
  const file_references: DealFileReference[] = []

  try {
    // 1. DEALS
    const { data: deals, error: dErr } = await supabase.from('deals').select('*').in('id', dealIds)
    if (dErr) throw dErr
    if (!deals || deals.length === 0) {
      return { success: false, error: 'Deals not found' }
    }
    pkg.deals = deals

    const foundDealIds = deals.map((d: any) => d.id)

    const { data: dItems, error: diErr } = await supabase.from('deal_items').select('*').in('deal_id', foundDealIds)
    if (diErr) throw diErr
    pkg.deal_items = dItems || []

    const { data: dStatus, error: dsErr } = await supabase.from('deal_status_history').select('*').in('deal_id', foundDealIds)
    if (dsErr) throw dsErr
    pkg.deal_status_history = dStatus || []

    const { data: dEdit, error: deErr } = await supabase.from('deal_edit_history').select('*').in('deal_id', foundDealIds)
    if (deErr) throw deErr
    pkg.deal_edit_history = dEdit || []

    // 2. SHIPMENTS
    const { data: sdInit, error: sdInitErr } = await supabase.from('shipment_deals').select('*').in('deal_id', foundDealIds)
    if (sdInitErr) throw sdInitErr

    if (sdInit && sdInit.length > 0) {
      const shipmentIds = [...new Set(sdInit.map((sd: any) => sd.shipment_id))]
      
      const { data: sdAll, error: sdAllErr } = await supabase.from('shipment_deals').select('*, shipments(shipment_number), deals(deal_number)').in('shipment_id', shipmentIds)
      if (sdAllErr) throw sdAllErr

      const validShipmentIds = new Set<string>()

      if (sdAll) {
        for (const sd of sdAll) {
          if (!selectedDealIds.has(sd.deal_id)) {
            const triggeringDeal = sdInit.find((i: any) => i.shipment_id === sd.shipment_id)?.deal_id
            dependencies.push({
              type: 'SHARED_SHIPMENT',
              selected_deal_id: triggeringDeal || 'unknown',
              required_deal_id: sd.deal_id,
              required_deal_number: sd.deals?.deal_number,
              reference_id: sd.shipment_id,
              reference_number: sd.shipments?.shipment_number,
              reason: `Shipment ${sd.shipments?.shipment_number || sd.shipment_id} is shared with unselected Deal ${sd.deals?.deal_number || sd.deal_id}`
            })
          } else {
            pkg.shipment_deals.push(sd)
          }
        }
      }

      for (const id of shipmentIds) validShipmentIds.add(id as string)

      if (validShipmentIds.size > 0) {
        const { data: ships, error: sErr } = await supabase.from('shipments').select('*').in('id', Array.from(validShipmentIds))
        if (sErr) throw sErr
        pkg.shipments = ships || []

        const { data: sDocs, error: sDocsErr } = await supabase.from('shipment_documents').select('*').in('shipment_id', Array.from(validShipmentIds))
        if (sDocsErr) throw sDocsErr
        pkg.shipment_documents = sDocs || []

        sDocs?.forEach((doc: any) => {
          if (doc.file_url) {
            file_references.push({ type: 'SHIPMENT_DOCUMENT', url: doc.file_url, reference_id: doc.id })
          }
        })
      }
    }

    pkg.shipment_deals = pkg.shipment_deals.map(sd => {
      const { shipments, deals, ...rest } = sd
      return rest
    })

    // 3. INVOICES
    const { data: iliInit, error: iliInitErr } = await supabase.from('invoice_line_items').select('*').in('deal_id', foundDealIds)
    if (iliInitErr) throw iliInitErr

    if (iliInit && iliInit.length > 0) {
      const invoiceIds = [...new Set(iliInit.map((ili: any) => ili.invoice_id))]

      const { data: iliAll, error: iliAllErr } = await supabase.from('invoice_line_items').select('*, invoices(invoice_number), deals(deal_number)').in('invoice_id', invoiceIds)
      if (iliAllErr) throw iliAllErr

      if (iliAll) {
        for (const line of iliAll) {
          if (!selectedDealIds.has(line.deal_id)) {
            const triggeringDeal = iliInit.find((i: any) => i.invoice_id === line.invoice_id)?.deal_id
            dependencies.push({
              type: 'SHARED_INVOICE',
              selected_deal_id: triggeringDeal || 'unknown',
              required_deal_id: line.deal_id,
              required_deal_number: line.deals?.deal_number,
              reference_id: line.invoice_id,
              reference_number: line.invoices?.invoice_number,
              reason: `Invoice ${line.invoices?.invoice_number || line.invoice_id} is shared with unselected Deal ${line.deals?.deal_number || line.deal_id}`
            })
          } else {
            pkg.invoice_line_items.push(line)
          }
        }
      }

      const { data: invs, error: invsErr } = await supabase.from('invoices').select('*').in('id', invoiceIds)
      if (invsErr) throw invsErr
      pkg.invoices = invs || []

      invs?.forEach((inv: any) => {
        if (inv.pdf_url) {
          file_references.push({ type: 'INVOICE_PDF', url: inv.pdf_url, reference_id: inv.id })
        }
      })

      const clientIds = [...new Set(pkg.invoices.map(i => i.client_id).filter(Boolean))]
      if (clientIds.length > 0) {
        const { data: clients, error: clErr } = await supabase.from('clients').select('*').in('id', clientIds)
        if (clErr) throw clErr
        pkg.clients = clients || []
      }

      const { data: payments, error: pErr } = await supabase.from('payments').select('*').in('invoice_id', invoiceIds)
      if (pErr) throw pErr
      pkg.payments = payments || []
    }

    pkg.invoice_line_items = pkg.invoice_line_items.map(ili => {
      const { invoices, deals, ...rest } = ili
      return rest
    })

    // 4. INVENTORY
    const { data: invItems, error: invItemsErr } = await supabase.from('inventory_items').select('*').in('deal_id', foundDealIds)
    if (invItemsErr) throw invItemsErr
    pkg.inventory_items = invItems || []

    if (pkg.inventory_items.length > 0) {
      const itemIds = pkg.inventory_items.map((i: any) => i.id)
      const { data: invHist, error: invHistErr } = await supabase.from('inventory_history').select('*').in('item_id', itemIds)
      if (invHistErr) throw invHistErr
      pkg.inventory_history = invHist || []

      // 5. ONLINE ORDERS
      const orderIds = [...new Set(pkg.inventory_items.map((i: any) => i.online_order_id).filter(Boolean))]

      if (orderIds.length > 0) {
        const { data: ooItemsAll, error: ooItemsAllErr } = await supabase.from('online_order_items').select('*, online_orders(order_number)').in('order_id', orderIds)
        if (ooItemsAllErr) throw ooItemsAllErr

        if (ooItemsAll) {
          const { data: siblingInvItems } = await supabase.from('inventory_items').select('deal_id, online_order_id').in('online_order_id', orderIds)

          for (const item of ooItemsAll) {
            pkg.online_order_items.push(item)
          }

          if (siblingInvItems) {
            for (const inv of siblingInvItems) {
               if (!selectedDealIds.has(inv.deal_id)) {
                  const triggeringItem = pkg.inventory_items.find((i: any) => i.online_order_id === inv.online_order_id)
                  const orderNum = ooItemsAll.find((o: any) => o.order_id === inv.online_order_id)?.online_orders?.order_number

                  dependencies.push({
                    type: 'SHARED_ORDER',
                    selected_deal_id: triggeringItem?.deal_id || 'unknown',
                    required_deal_id: inv.deal_id,
                    reference_id: inv.online_order_id as string,
                    reference_number: orderNum as string,
                    reason: 'Online order contains inventory items from deals that were not selected.'
                  })
               }
            }
          }
        }

        const { data: orders, error: oErr } = await supabase.from('online_orders').select('*').in('id', orderIds)
        if (oErr) throw oErr
        pkg.online_orders = orders || []
      }
    }

    pkg.online_order_items = pkg.online_order_items.map(ooi => {
      const { online_orders, ...rest } = ooi
      return rest
    })

    const unique = (arr: any[]) => Array.from(new Map(arr.map(item => [item.id, item])).values())
    
    pkg.deals = unique(pkg.deals)
    pkg.deal_items = unique(pkg.deal_items)
    pkg.deal_status_history = unique(pkg.deal_status_history)
    pkg.deal_edit_history = unique(pkg.deal_edit_history)
    pkg.shipments = unique(pkg.shipments)
    pkg.shipment_deals = unique(pkg.shipment_deals)
    pkg.shipment_documents = unique(pkg.shipment_documents)
    pkg.invoices = unique(pkg.invoices)
    pkg.invoice_line_items = unique(pkg.invoice_line_items)
    pkg.clients = unique(pkg.clients)
    pkg.payments = unique(pkg.payments)
    pkg.inventory_items = unique(pkg.inventory_items)
    pkg.inventory_history = unique(pkg.inventory_history)
    pkg.online_orders = unique(pkg.online_orders)
    pkg.online_order_items = unique(pkg.online_order_items)

    const uniqueDeps = Array.from(new Map(dependencies.map(d => [d.required_deal_id + d.reference_id, d])).values())

    const counts = {
      deals: pkg.deals.length,
      deal_items: pkg.deal_items.length,
      deal_status_history: pkg.deal_status_history.length,
      deal_edit_history: pkg.deal_edit_history.length,
      shipments: pkg.shipments.length,
      shipment_deals: pkg.shipment_deals.length,
      shipment_documents: pkg.shipment_documents.length,
      invoices: pkg.invoices.length,
      invoice_line_items: pkg.invoice_line_items.length,
      clients: pkg.clients.length,
      payments: pkg.payments.length,
      inventory_items: pkg.inventory_items.length,
      inventory_history: pkg.inventory_history.length,
      online_orders: pkg.online_orders.length,
      online_order_items: pkg.online_order_items.length,
      file_references: file_references.length,
      required_dependencies: uniqueDeps.length,
      total_records: 0
    }

    counts.total_records = Object.entries(counts)
      .filter(([key]) => key !== 'total_records' && key !== 'file_references' && key !== 'required_dependencies')
      .reduce((sum, [, val]) => sum + (val as number), 0)

    const estimated_payload_bytes = Buffer.byteLength(JSON.stringify(pkg))

    return {
      success: true,
      package: pkg,
      counts,
      required_dependencies: uniqueDeps,
      warnings,
      file_references,
      estimated_payload_bytes
    }

  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error occurred during discovery' }
  }
}
