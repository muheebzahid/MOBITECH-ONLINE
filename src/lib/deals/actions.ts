'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit/actions'

function enrichDealFinancials(deal: any) {
  if (!deal) return deal

  const dealQty = deal.quantity || 0
  const baseUnitCost = dealQty > 0 ? (deal.total_commitment || 0) / dealQty : 0
  
  // Calculate shipping cost per unit
  const shipment = deal.shipment_deals?.[0]?.shipments
  let shippingCostPerUnit = 0
  if (shipment) {
    const totalShipmentUnits = shipment.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0
    shippingCostPerUnit = totalShipmentUnits > 0 ? (shipment.total_logistics_cost || 0) / totalShipmentUnits : 0
  }

  // Filter active line items (non-cancelled, non-draft)
  const activeLineItems = (deal.invoice_line_items || []).filter((li: any) => {
    const status = li.invoices?.status || li.invoice_status
    return status !== 'CANCELLED' && status !== 'DRAFT'
  })

  const totalRevenue = activeLineItems.reduce((sum: number, li: any) => sum + (li.quantity || 0) * (li.unit_price || 0), 0)
  const soldQty = activeLineItems.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
  
  const totalCogs = soldQty * (baseUnitCost + shippingCostPerUnit)

  // Amex Profit based on paid-in-full units
  const paidLineItems = activeLineItems.filter((li: any) => {
    const status = li.invoices?.status || li.invoice_status
    return status === 'PAID'
  })
  const paidQty = paidLineItems.reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)

  let amexProfitMultiplier = 0
  if (deal.funding_source === 'AMEX') {
    amexProfitMultiplier = 1
  } else if (deal.funding_source === 'MIXED') {
    const commitment = Number(deal.total_commitment) || 1
    amexProfitMultiplier = (Number(deal.amex_amount) || 0) / commitment
  }

  const amexProfit = paidQty * baseUnitCost * amexProfitMultiplier * 0.02
  const grossProfit = totalRevenue - totalCogs + amexProfit

  return {
    ...deal,
    total_revenue: totalRevenue,
    total_cogs: totalCogs,
    gross_profit: grossProfit,
    amex_profit: amexProfit
  }
}

// Generate deal number: ATT-2026-0001
async function generateDealNumber(supplier: string): Promise<string> {
  const supabase = await createClient()
  const year = new Date().getFullYear()
  const prefix = supplier === 'ECOATM' ? 'ECO' : supplier === 'ATT' ? 'ATT' : 'DL'

  const { count } = await supabase
    .from('deals')
    .select('*', { count: 'exact', head: true })
    .ilike('deal_number', `${prefix}-${year}-%`)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `${prefix}-${year}-${seq}`
}

export async function createDeal(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const manual_deal_number = formData.get('deal_number') as string
  const auction_won_date = formData.get('auction_won_date') as string
  const supplier        = formData.get('supplier') as string
  const auction_platform = formData.get('auction_platform') as string
  
  // Legacy scalar fields
  let model           = formData.get('model') as string
  let storage         = formData.get('storage') as string
  let grade           = formData.get('grade') as string
  let color           = formData.get('color') as string
  let carrier         = formData.get('carrier') as string
  let quantity        = parseInt(formData.get('quantity') as string) || 0
  let unit_cost       = parseFloat(formData.get('unit_cost') as string) || 0
  let total_cost      = quantity * unit_cost
  
  let auction_fee_pct = parseFloat(formData.get('auction_fee_pct') as string) || 2
  if (auction_platform !== 'BSTOCK') {
    auction_fee_pct = 0
  }
  const other_fees      = parseFloat(formData.get('other_fees') as string) || 0

  let funding_source  = formData.get('funding_source') as string
  if (supplier === 'TMOBILE') {
    funding_source = 'SB_CASH'
  }
  const amex_statement_date = formData.get('amex_statement_date') as string
  const notes           = formData.get('notes') as string

  // Handle line items if provided
  const items_json = formData.get('items_json') as string
  let items: any[] = []
  if (items_json) {
    try {
      items = JSON.parse(items_json)
      if (items.length > 0) {
        quantity = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0)
        total_cost = items.reduce((sum, item) => sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0)), 0)
        unit_cost = quantity > 0 ? total_cost / quantity : 0
        
        // If it's a mixed lot, set legacy fields to represent the mix
        if (items.length === 1) {
          model = items[0].model
          storage = items[0].storage
          grade = items[0].grade
          color = items[0].color
          carrier = items[0].carrier
        } else {
          model = 'Mixed Lot'
          storage = 'Mixed'
          grade = 'Mixed'
          color = 'Mixed'
          carrier = 'Mixed'
        }
      }
    } catch (e) {
      console.error('Failed to parse items_json', e)
    }
  }

  // Calculations
  const auction_fee      = parseFloat(((total_cost * auction_fee_pct) / 100).toFixed(2))
  const total_commitment = total_cost + auction_fee + other_fees

  let amex_amount = 0
  let cash_amount = 0
  if (funding_source === 'AMEX') {
    amex_amount = total_commitment
  } else if (funding_source === 'TURBO_CASH' || funding_source === 'SB_CASH') {
    cash_amount = total_commitment
  } else {
    amex_amount = parseFloat(formData.get('amex_amount') as string) || 0
    cash_amount = parseFloat(formData.get('cash_amount') as string) || 0
  }

  // Cashback eligibility check
  const today = new Date()
  const statementDate = amex_statement_date ? new Date(amex_statement_date) : null
  const cashback_eligible = !!(statementDate && today < statementDate)

  let deal_number = manual_deal_number
  if (!deal_number) {
    deal_number = await generateDealNumber(supplier)
  }
  
  let dealDate = new Date()
  if (auction_won_date) {
    const awd = new Date(auction_won_date)
    if (!isNaN(awd.getTime())) dealDate = awd
  }

  const { data, error } = await supabase.from('deals').insert({
    deal_number,
    supplier,
    auction_platform,
    model,
    storage,
    grade,
    color,
    carrier,
    quantity,
    unit_cost,
    total_cost,
    auction_fee,
    other_fees,
    total_commitment,
    funding_source,
    amex_amount,
    cash_amount,
    amex_statement_date: amex_statement_date || null,
    cashback_eligible,
    status: 'AUCTION_WON',
    auction_won_date: dealDate.toISOString(),
    created_at: dealDate.toISOString(),
    notes,
    created_by: user.id,
  }).select().single()

  if (error) return { error: error.message }

  // Insert deal items if any
  if (items.length > 0) {
    const itemsToInsert = items.map(i => ({
      deal_id: data.id,
      model: i.model,
      storage: i.storage || null,
      grade: i.grade || null,
      color: i.color || null,
      carrier: i.carrier || null,
      quantity: parseInt(i.quantity) || 0,
      unit_cost: parseFloat(i.unit_cost) || 0
    }))
    await supabase.from('deal_items').insert(itemsToInsert)
  }

  // Log status history
  await supabase.from('deal_status_history').insert({
    deal_id: data.id,
    old_status: null,
    new_status: 'AUCTION_WON',
    notes: 'Deal created from auction win',
    changed_by: user.id,
  })

  revalidatePath('/dashboard/deals')
  return { success: true, deal: data }
}

export async function updateDealStatus(dealId: string, newStatus: string, notes?: string, dateOverride?: string, additionalDealIds: string[] = [], attInvoiceNumber?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: deal } = await supabase.from('deals').select('status, deal_number').eq('id', dealId).single()
  if (!deal) return { error: 'Deal not found' }

  // Build timestamp field update based on new status
  const timestampField: Record<string, string> = {
    PAYMENT_REQUIRED:      'payment_link_date',
    PAID:                  'payment_date',
    READY_FOR_PICKUP:      'pickup_ready_date',
    IN_TRANSIT_USA:        'shipped_usa_date',
    AT_SB_TECHNOLOGY:      'arrived_miami_date',
    IN_TRANSIT_DUBAI:      'shipped_dubai_date',
    AT_TURBO_LOGISTICS:    'arrived_dubai_date',
    RECEIVED_BY_MOBITECH:  'received_mobitech_date',
    DEAL_CLOSED:           'deal_closed_date',
  }

  const updatePayload: Record<string, any> = { status: newStatus }
  if (timestampField[newStatus]) {
    updatePayload[timestampField[newStatus]] = dateOverride ? new Date(dateOverride).toISOString() : new Date().toISOString()
  }

  if (newStatus === 'DEAL_CLOSED') {
    const { data: enriched } = await supabase
      .from('deals')
      .select(`*, items:deal_items(*), shipment_deals(shipments(*, shipment_deals(deal_id, deals(id, deal_number, status, quantity)))), invoice_line_items(*, invoices(*))`)
      .eq('id', dealId)
      .single()
    if (enriched) {
      const financials = enrichDealFinancials(enriched)
      updatePayload.total_revenue = financials.total_revenue
      updatePayload.total_cogs = financials.total_cogs
      updatePayload.gross_profit = financials.gross_profit
    }
  }

  const LOGISTICS_STATUSES = [
    'READY_FOR_PICKUP',
    'IN_TRANSIT_USA',
    'AT_SB_TECHNOLOGY',
    'IN_TRANSIT_DUBAI',
    'AT_TURBO_LOGISTICS',
    'RECEIVED_BY_MOBITECH',
  ]

  if (attInvoiceNumber && attInvoiceNumber.trim() !== '') {
    const baseNumber = deal.deal_number.split(' (Inv:')[0].trim()
    updatePayload.deal_number = `${baseNumber} (Inv: ${attInvoiceNumber.trim()})`
  }

  if (LOGISTICS_STATUSES.includes(newStatus) && additionalDealIds.length > 0) {
    const extraIds = additionalDealIds.filter(id => id !== dealId)
    if (extraIds.length > 0) {
      const { data: allDeals } = await supabase.from('deals').select('id, status').in('id', extraIds)
      
      const { error } = await supabase.from('deals').update(updatePayload).in('id', extraIds)
      if (error) return { error: error.message }
      
      if (allDeals) {
        const historyPayload = allDeals.map((d: any) => ({
          deal_id: d.id,
          old_status: d.status,
          new_status: newStatus,
          notes: 'Auto-updated alongside deal synchronization',
          changed_by: user.id,
        }))
        await supabase.from('deal_status_history').insert(historyPayload)
      }
      
      for (const id of extraIds) {
        revalidatePath(`/dashboard/deals/${id}`)
      }
    }
  }

  const { error } = await supabase.from('deals').update(updatePayload).eq('id', dealId)
  if (error) return { error: error.message }

  await supabase.from('deal_status_history').insert({
    deal_id: dealId,
    old_status: deal.status,
    new_status: newStatus,
    notes: notes || null,
    changed_by: user.id,
    changed_at: dateOverride ? new Date(dateOverride).toISOString() : new Date().toISOString()
  })

  await logAudit({
    tableName: 'deals',
    recordId: dealId,
    action: 'STATUS_CHANGE',
    oldData: { status: deal.status },
    newData: { status: newStatus, notes: notes || null }
  })

  revalidatePath('/dashboard/deals')
  revalidatePath(`/dashboard/deals/${dealId}`)
  return { success: true }
}

export async function syncDealSoldStatus(dealId: string) {
  const supabase = await createClient()
  
  // Get deal
  const { data: deal } = await supabase
    .from('deals')
    .select(`
      *,
      items:deal_items(*),
      shipment_deals(shipments(*, shipment_deals(deal_id, deals(id, deal_number, status, quantity)))),
      invoice_line_items(*, invoices(*))
    `)
    .eq('id', dealId)
    .single()

  if (!deal) return

  // Get valid line items
  const invoicedQty = (deal.invoice_line_items || [])
    .filter((i: any) => i.invoices && i.invoices.status !== 'CANCELLED' && i.invoices.status !== 'VOIDED')
    .reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)

  let newStatus = deal.status
  if (invoicedQty >= deal.quantity) {
    newStatus = 'SOLD'
  } else if (invoicedQty > 0) {
    newStatus = 'PARTIALLY_SOLD'
  } else if (deal.status === 'PARTIALLY_SOLD' || deal.status === 'SOLD') {
    newStatus = 'RECEIVED_BY_MOBITECH'
  }

  // Recalculate financials
  const financials = enrichDealFinancials(deal)

  const updatePayload: Record<string, any> = {
    total_revenue: financials.total_revenue,
    total_cogs: financials.total_cogs,
    gross_profit: financials.gross_profit
  }

  if (newStatus !== deal.status) {
    updatePayload.status = newStatus
  }

  await supabase.from('deals').update(updatePayload).eq('id', dealId)

  if (newStatus !== deal.status) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('deal_status_history').insert({
        deal_id: dealId,
        old_status: deal.status,
        new_status: newStatus,
        notes: 'Auto-updated based on invoiced quantity',
        changed_by: user.id,
      })
    }
  }

  revalidatePath(`/dashboard/deals/${dealId}`)
  revalidatePath('/dashboard/deals')
}

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function deleteDeal(dealId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Must be SUPER_ADMIN to delete
  const { getUserRole } = await import('@/lib/admin/actions')
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') return { error: 'Unauthorized to delete deals.' }

  // Bypass RLS to force delete from everywhere
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabaseAdmin.from('deals').delete().eq('id', dealId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/deals')
  return { success: true }
}

const DEALS_PAGE_SIZE = 10000

export async function getDeals(page: number = 0) {
  const supabase = await createClient()

  const from = page * DEALS_PAGE_SIZE
  const to = from + DEALS_PAGE_SIZE - 1

  const [
    { count },
    { data, error },
    { data: syncStates }
  ] = await Promise.all([
    supabase.from('deals').select('*', { count: 'exact', head: true }),
    supabase
      .from('deals')
      .select('*, items:deal_items(*), shipment_deals(shipments(id, shipment_number, total_logistics_cost, shipment_deals(deals(quantity)))), invoice_line_items(quantity, unit_price, deal_item_id, invoices(id, status, amount_paid, issue_date))')
      .order('created_at', { ascending: false })
      .range(from, to),
    supabase
      .from('record_sync_state')
      .select('source_record_id, last_synced_at')
      .eq('source_table', 'deals')
  ])

  if (error || !data) return { data: [], total: 0 }

  const syncMap: Record<string, string> = {}
  if (syncStates) {
    for (const ss of syncStates) {
      syncMap[ss.source_record_id] = ss.last_synced_at
    }
  }

  const enriched = data.map((deal: any) => {
    const syncedAt = deal.synced_to_online_at || deal.last_synced_at || syncMap[deal.id] || null
    return enrichDealFinancials({
      ...deal,
      synced_to_online_at: syncedAt,
      last_synced_at: syncedAt
    })
  })

  return { data: enriched, total: count || 0 }
}

export async function getDealById(id: string) {
  const supabase = await createClient()

  // Fetch core deal + status history + invoices + inventory + items + shipment info with sibling deals
  const { data, error } = await supabase
    .from('deals')
    .select(`*, deal_documents(*), items:deal_items(*), deal_status_history(*), invoice_line_items(*, invoices(*)), inventory_items(*), shipment_deals(shipments(*, shipment_deals(deal_id, deals(id, deal_number, status, quantity))))`)
    .eq('id', id)
    .single()


  if (error || !data) return null

  // Fetch edit history separately (table may not exist yet — fail gracefully)
  const { data: editHistory } = await supabase
    .from('deal_edit_history')
    .select('*')
    .eq('deal_id', id)
    .order('edited_at', { ascending: false })

  const enriched = enrichDealFinancials(data)
  return { ...enriched, deal_edit_history: editHistory || [] }
}

export async function updateDeal(dealId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Fetch current deal to diff against
  const { data: current, error: fetchErr } = await supabase
    .from('deals')
    .select('*, items:deal_items(*)')
    .eq('id', dealId)
    .single()
  if (fetchErr || !current) return { error: 'Deal not found' }

  const deal_number       = formData.get('deal_number') as string
  const auction_won_date  = formData.get('auction_won_date') as string
  const supplier          = formData.get('supplier') as string
  const auction_platform  = formData.get('auction_platform') as string
  
  // Legacy fields
  let model             = formData.get('model') as string
  let storage           = formData.get('storage') as string
  let grade             = formData.get('grade') as string
  let color             = formData.get('color') as string
  let carrier           = formData.get('carrier') as string
  let quantity          = parseInt(formData.get('quantity') as string) || 0
  let unit_cost         = parseFloat(formData.get('unit_cost') as string) || 0
  let total_cost        = quantity * unit_cost
  
  let auction_fee_pct   = parseFloat(formData.get('auction_fee_pct') as string) || 2
  if (auction_platform !== 'BSTOCK') {
    auction_fee_pct = 0
  }
  const other_fees        = parseFloat(formData.get('other_fees') as string) || 0

  let funding_source    = formData.get('funding_source') as string
  if (supplier === 'TMOBILE') {
    funding_source = 'SB_CASH'
  }
  const amex_statement_date = formData.get('amex_statement_date') as string
  const notes             = formData.get('notes') as string
  const edit_note         = formData.get('edit_note') as string

  // Handle line items if provided
  const items_json = formData.get('items_json') as string
  let items: any[] | null = null
  if (items_json) {
    try {
      items = JSON.parse(items_json)
      if (items && items.length > 0) {
        quantity = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0)
        total_cost = items.reduce((sum, item) => sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.unit_cost) || 0)), 0)
        unit_cost = quantity > 0 ? total_cost / quantity : 0
        
        // If it's a mixed lot, set legacy fields to represent the mix
        if (items.length === 1) {
          model = items[0].model
          storage = items[0].storage
          grade = items[0].grade
          color = items[0].color
          carrier = items[0].carrier
        } else {
          model = 'Mixed Lot'
          storage = 'Mixed'
          grade = 'Mixed'
          color = 'Mixed'
          carrier = 'Mixed'
        }
      }
    } catch (e) {
      console.error('Failed to parse items_json', e)
    }
  }

  // Recalculate financials
  const auction_fee       = parseFloat(((total_cost * auction_fee_pct) / 100).toFixed(2))
  const total_commitment  = total_cost + auction_fee + other_fees

  let amex_amount = 0
  let cash_amount = 0
  if (funding_source === 'AMEX')       amex_amount = total_commitment
  else if (funding_source === 'TURBO_CASH' || funding_source === 'SB_CASH') cash_amount = total_commitment
  else {
    amex_amount = parseFloat(formData.get('amex_amount') as string) || 0
    cash_amount = parseFloat(formData.get('cash_amount') as string) || 0
  }

  const today = new Date()
  const statementDate = amex_statement_date ? new Date(amex_statement_date) : null
  const cashback_eligible = !!(statementDate && today < statementDate)

  const payment_date = formData.get('payment_date') as string | null
  const shipped_usa_date = formData.get('shipped_usa_date') as string | null
  const arrived_dubai_date = formData.get('arrived_dubai_date') as string | null
  const received_mobitech_date = formData.get('received_mobitech_date') as string | null
  const deal_closed_date = formData.get('deal_closed_date') as string | null

  const updated: any = {
    supplier, auction_platform, model, storage, grade, color, carrier,
    quantity, unit_cost, total_cost, auction_fee, other_fees, total_commitment,
    funding_source, amex_amount, cash_amount,
    amex_statement_date: amex_statement_date || null,
    cashback_eligible, notes,
  }
  
  if (deal_number) updated.deal_number = deal_number
  if (auction_won_date) {
    const awd = new Date(auction_won_date)
    if (!isNaN(awd.getTime())) updated.auction_won_date = awd.toISOString()
  }
  
  if (payment_date !== null) updated.payment_date = payment_date ? new Date(payment_date).toISOString() : null
  if (shipped_usa_date !== null) updated.shipped_usa_date = shipped_usa_date ? new Date(shipped_usa_date).toISOString() : null
  if (arrived_dubai_date !== null) updated.arrived_dubai_date = arrived_dubai_date ? new Date(arrived_dubai_date).toISOString() : null
  if (received_mobitech_date !== null) updated.received_mobitech_date = received_mobitech_date ? new Date(received_mobitech_date).toISOString() : null
  if (deal_closed_date !== null) updated.deal_closed_date = deal_closed_date ? new Date(deal_closed_date).toISOString() : null

  // Build field-level diff
  const LABELS: Record<string, string> = {
    deal_number: 'Deal Number', auction_won_date: 'Auction Won Date',
    supplier: 'Supplier', auction_platform: 'Platform', model: 'Model',
    storage: 'Storage', grade: 'Grade', color: 'Color', carrier: 'Carrier',
    quantity: 'Quantity', unit_cost: 'Unit Cost', total_cost: 'Total Cost',
    auction_fee: 'Auction Fee', other_fees: 'Other Fees',
    total_commitment: 'Total Commitment', funding_source: 'Funding Source',
    amex_amount: 'Amex Amount', cash_amount: 'Cash Amount',
    amex_statement_date: 'Amex Statement Date', cashback_eligible: 'Cashback Eligible',
    notes: 'Notes',
    payment_date: 'Payment Date',
    shipped_usa_date: 'Shipped USA Date',
    arrived_dubai_date: 'Arrived Dubai Date',
    received_mobitech_date: 'Received by Mobitech Date',
    deal_closed_date: 'Deal Closed Date',
  }

  const field_changes: { field: string; label: string; old_value: string; new_value: string }[] = []
  for (const key of Object.keys(updated) as (keyof typeof updated)[]) {
    const oldVal = String(current[key] ?? '')
    const newVal = String(updated[key] ?? '')
    if (oldVal !== newVal) {
      field_changes.push({
        field: String(key),
        label: (LABELS as any)[key] || String(key),
        old_value: oldVal,
        new_value: newVal,
      })
    }
  }

  if (field_changes.length === 0 && !edit_note) {
    return { success: true, noChanges: true }
  }

  // Apply update
  const { error: updateErr } = await supabase
    .from('deals')
    .update(updated)
    .eq('id', dealId)
  if (updateErr) return { error: updateErr.message }



  // Sync items (smart upsert to preserve ids and invoice_line_items links)
  if (items) {
    // 1. Get existing items from database
    const { data: dbItems } = await supabase
      .from('deal_items')
      .select('id')
      .eq('deal_id', dealId)
      
    const dbItemIds = (dbItems || []).map(item => item.id)
    const submittedItemIds = items.map(i => i.id).filter(Boolean)
    
    // Delete removed items
    const idsToDelete = dbItemIds.filter(id => !submittedItemIds.includes(id))
    if (idsToDelete.length > 0) {
      await supabase.from('deal_items').delete().in('id', idsToDelete)
    }

    // Fetch shipment details to compute pro-rated shipping cost
    const { data: dealRec } = await supabase
      .from('deals')
      .select('shipment_deals(shipments(sb_fee, freight_cost, duty_amount, turbo_fee, shipment_deals(deals(quantity))))')
      .eq('id', dealId)
      .single()
      
    let shippingCostPerUnit = 0
    const shipmentObj: any = Array.isArray(dealRec?.shipment_deals?.[0]?.shipments)
      ? dealRec?.shipment_deals?.[0]?.shipments?.[0]
      : dealRec?.shipment_deals?.[0]?.shipments

    if (shipmentObj) {
      const totalLogisticsCost = Number(shipmentObj.sb_fee || 0) + Number(shipmentObj.freight_cost || 0) + Number(shipmentObj.duty_amount || 0) + Number(shipmentObj.turbo_fee || 0)
      const totalShipmentUnits = shipmentObj.shipment_deals?.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0) || 0
      shippingCostPerUnit = totalShipmentUnits > 0 ? (totalLogisticsCost / totalShipmentUnits) : 0
    }
    
    // Update or Insert items
    for (const i of items) {
      const itemData = {
        deal_id: dealId,
        model: i.model,
        storage: i.storage || null,
        grade: i.grade || null,
        color: i.color || null,
        carrier: i.carrier || null,
        quantity: parseInt(i.quantity) || 0,
        unit_cost: parseFloat(i.unit_cost) || 0
      }
      
      if (i.id && dbItemIds.includes(i.id)) {
        // Update existing item
        await supabase.from('deal_items').update(itemData).eq('id', i.id)
      } else {
        // Insert new item
        await supabase.from('deal_items').insert(itemData)
      }

      // Propagate unit_cost and logistics_cost to inventory_items scanned under this SKU
      let query = supabase.from('inventory_items')
        .update({
          unit_cost: parseFloat(i.unit_cost) || 0,
          logistics_cost: shippingCostPerUnit
        })
        .eq('deal_id', dealId)
        .eq('model', i.model)
        
      if (i.storage) query = query.eq('storage', i.storage)
      else query = query.is('storage', null)
      
      if (i.grade) query = query.eq('grade', i.grade)
      else query = query.is('grade', null)
      
      await query
    }
    
    field_changes.push({
      field: 'items',
      label: 'Line Items',
      old_value: `${dbItemIds.length} items`,
      new_value: `${items.length} items`,
    })
  }

  // Log edit history
  if (field_changes.length > 0 || edit_note) {
    await supabase.from('deal_edit_history').insert({
      deal_id: dealId,
      edited_by: user.id,
      field_changes,
      edit_note: edit_note || null,
    })
  }

  revalidatePath('/dashboard/deals')
  revalidatePath(`/dashboard/deals/${dealId}`)
  return { success: true, changesCount: field_changes.length }
}

export async function getDealEditHistory(dealId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('deal_edit_history')
    .select('*')
    .eq('deal_id', dealId)
    .order('edited_at', { ascending: false })
  return data || []
}

export async function bulkCreateDeals(dealsData: any[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const year = new Date().getFullYear()
  
  const { count } = await supabase
    .from('deals')
    .select('*', { count: 'exact', head: true })
    .ilike('deal_number', `%-${year}-%`)

  let startSeq = (count || 0) + 1

  // Resolve deal numbers and assign temp generated ones for empty ones so they do not group
  const rowsWithDealNumbers = dealsData.map((d, index) => {
    const supplier = String(d.vendor || 'OTHER').toUpperCase()
    const prefix = supplier === 'ECOATM' ? 'ECO' : supplier === 'ATT' ? 'ATT' : 'DL'
    
    let deal_number = d.deal_number ? String(d.deal_number).trim() : ''
    
    if (deal_number && /^\d+$/.test(deal_number)) {
      const seq = deal_number.padStart(4, '0')
      deal_number = `${prefix}-${year}-${seq}`
    }
    
    if (!deal_number) {
      const seq = String(startSeq + index).padStart(4, '0')
      deal_number = `GEN-${prefix}-${year}-${seq}`
    }

    return {
      ...d,
      resolved_deal_number: deal_number
    }
  })

  // Group by resolved_deal_number
  const groups: Record<string, typeof rowsWithDealNumbers> = {}
  for (const row of rowsWithDealNumbers) {
    const key = row.resolved_deal_number
    if (!groups[key]) groups[key] = []
    groups[key].push(row)
  }

  // Build the unique deals list
  const dealsToUpsert = Object.keys(groups).map((dealNumber) => {
    const items = groups[dealNumber]
    const firstItem = items[0]

    const quantity = items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0)
    const total_cost = items.reduce((sum, item) => sum + (parseFloat(item.total_cost) || (parseFloat(item.unit_cost) || 0) * (parseInt(item.quantity) || 0)), 0)
    const unit_cost = quantity > 0 ? total_cost / quantity : 0

    let auction_fee_pct = parseFloat(firstItem.auction_fee_pct) || 0
    if ((firstItem.auction_platform || 'DIRECT') !== 'BSTOCK') {
      auction_fee_pct = 0
    }
    const other_fees = parseFloat(firstItem.other_fees) || 0
    const auction_fee = parseFloat(((total_cost * auction_fee_pct) / 100).toFixed(2))
    const total_commitment = total_cost + auction_fee + other_fees


    const funding_source = (firstItem.funding_source || 'TURBO_CASH').toUpperCase()
    const amex_amount = funding_source === 'AMEX' ? total_commitment : (funding_source === 'MIXED' ? total_commitment / 2 : 0)
    const cash_amount = (funding_source === 'TURBO_CASH' || funding_source === 'SB_CASH') ? total_commitment : (funding_source === 'MIXED' ? total_commitment / 2 : 0)

    let dealDate = new Date()
    if (firstItem.date) {
      const parsedDate = new Date(firstItem.date)
      if (!isNaN(parsedDate.getTime())) {
        dealDate = parsedDate
      }
    }

    const amex_statement_date = firstItem.amex_statement_date && !isNaN(new Date(firstItem.amex_statement_date).getTime())
      ? new Date(firstItem.amex_statement_date).toISOString().split('T')[0]
      : null

    const isMixed = items.length > 1
    const model = isMixed ? 'Mixed Lot' : (firstItem.model || 'Unknown')
    const storage = isMixed ? 'Mixed' : (firstItem.storage || null)
    const grade = isMixed ? 'Mixed' : (firstItem.grade || null)
    const color = isMixed ? 'Mixed' : (firstItem.color || null)
    const carrier = isMixed ? 'Mixed' : (firstItem.carrier || null)

    const notesList = items.map(i => i.notes || (i.condition ? `Condition: ${i.condition}` : '')).filter(Boolean)
    const notes = notesList.length > 0 ? Array.from(new Set(notesList)).join(' | ') : null

    let final_deal_number = dealNumber
    if (final_deal_number.startsWith('GEN-')) {
      final_deal_number = final_deal_number.substring(4)
    }

    return {
      deal_number: final_deal_number,
      supplier: firstItem.vendor || 'OTHER',
      auction_platform: firstItem.auction_platform || 'DIRECT',
      model,
      storage,
      grade,
      color,
      carrier,
      quantity,
      unit_cost,
      total_cost,
      auction_fee,
      other_fees,
      total_commitment,
      funding_source,
      amex_amount,
      cash_amount,
      status: 'AUCTION_WON',
      auction_won_date: dealDate.toISOString(),
      created_at: dealDate.toISOString(),
      notes,
      created_by: user.id,
      amex_statement_date,
    }
  })

  // Upsert unique deals
  const { data: insertedDeals, error } = await supabase
    .from('deals')
    .upsert(dealsToUpsert, { onConflict: 'deal_number' })
    .select()
  
  if (error) return { error: error.message }
  
  // Insert or refresh all child deal items
  if (insertedDeals && insertedDeals.length > 0) {
    const itemsToInsert: any[] = []
    
    for (const deal of insertedDeals) {
      let groupKey = deal.deal_number
      if (!groups[groupKey] && groups['GEN-' + groupKey]) {
        groupKey = 'GEN-' + groupKey
      }

      const rows = groups[groupKey]
      if (rows) {
        for (const row of rows) {
          const qty = parseInt(row.quantity) || 1
          const totalCost = parseFloat(row.total_cost) || 0
          const unitCost = parseFloat(row.unit_cost) || (qty > 0 ? totalCost / qty : 0)
          
          itemsToInsert.push({
            deal_id: deal.id,
            model: row.model || 'Unknown',
            storage: row.storage || null,
            grade: row.grade || null,
            carrier: row.carrier || null,
            color: row.color || null,
            quantity: qty,
            unit_cost: unitCost
          })
        }
      }
    }
    
    const dealIds = insertedDeals.map(d => d.id)
    await supabase.from('deal_items').delete().in('deal_id', dealIds)
    await supabase.from('deal_items').insert(itemsToInsert)
  }
  
  revalidatePath('/dashboard/deals')
  return { success: true, count: dealsToUpsert.length }
}

export async function moveSkuToOnlineInventory(
  dealId: string,
  dealItemId: string,
  originalModel: string,
  quantityToMove: number,
  totalLandedCost: number
) {
  const supabase = await createClient()

  // 1. (Obsolete) No longer using Master Deal, we generate inventory_items directly.

  // 2. Get original item
  const { data: origItem, error: oiError } = await supabase
    .from('deal_items')
    .select('*')
    .eq('id', dealItemId)
    .single()
  if (oiError) return { error: oiError.message }

  // 3. Create invoice for original deal (selling to Internal - Online Inventory at Cost)
  let { data: client, error: cError } = await supabase
    .from('clients')
    .select('id')
    .eq('name', 'Internal - Online Inventory')
    .single()
    
  let clientId = client?.id
  if (!clientId) {
    const { data: newClient, error: ncError } = await supabase
      .from('clients')
      .insert({ 
        id: '4b6cd459-dd29-4be7-a28e-58cbbed31285',
        name: 'Internal - Online Inventory',
        email: 'internal-online@mobitech.com',
        phone: '+971500000000',
        address: 'Internal Dubai Warehouse'
      })
      .select()
      .single()
    if (ncError) return { error: ncError.message }
    clientId = newClient.id
  }

  // Check if there is an existing ISSUED invoice for Internal - Online Inventory
  const { data: existingInvoice, error: findError } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('customer_name', 'Internal - Online Inventory')
    .eq('status', 'ISSUED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (findError) {
    console.error('Error finding existing internal invoice:', findError.message)
  }

  let invoiceId = existingInvoice?.id

  if (!invoiceId) {
    // Create new invoice with status ISSUED
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .insert({
        client_id: clientId,
        customer_name: 'Internal - Online Inventory',
        invoice_number: `INV-ONL-${Date.now()}`,
        status: 'ISSUED',
      })
      .select()
      .single()
      
    if (invError) return { error: invError.message }
    invoiceId = invoice.id
  }

  // Create invoice line item
  const { error: lineError } = await supabase
    .from('invoice_line_items')
    .insert({
      invoice_id: invoiceId,
      deal_id: dealId,
      deal_item_id: dealItemId,
      description: `Moved to online inventory: ${originalModel}`,
      quantity: quantityToMove,
      unit_price: totalLandedCost
    })
  if (lineError) return { error: lineError.message }

  // 4. Generate Inventory Items for Refurbishment Pipeline
  const itemsToInsert = Array.from({ length: quantityToMove }).map(() => ({
    deal_id: dealId,
    model: origItem.model,
    storage: origItem.storage,
    grade: origItem.grade,
    unit_cost: totalLandedCost, // Inherit landed cost
    logistics_cost: 0, 
    repair_cost: 0,
    status: 'AVAILABLE',
    location: 'DUBAI_WAREHOUSE',
    refurb_stage: 'SEPARATED'
  }))

  const { error: invError2 } = await supabase
    .from('inventory_items')
    .insert(itemsToInsert)
  
  if (invError2) return { error: invError2.message }

  revalidatePath('/dashboard/deals')
  revalidatePath('/dashboard/deals/' + dealId)
  return { success: true }
}

export async function uploadDealDocument(dealId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  
  const file = formData.get('file') as File
  if (!file) return { error: 'No file provided' }
  
  const fileName = file.name
  const ext = fileName.split('.').pop()
  const filePath = `deals/${dealId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
  
  const { error: uploadError } = await supabase.storage
    .from('invoices')
    .upload(filePath, file)
    
  if (uploadError) return { error: uploadError.message }
  
  const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(filePath)
  const url = publicUrlData.publicUrl
  
  const { error: dbError } = await supabase.from('deal_documents').insert({
    deal_id: dealId,
    file_name: fileName,
    file_url: url,
    document_type: 'OTHER',
    notes: `Type: ${file.type || 'unknown'}, Size: ${(file.size / 1024).toFixed(1)} KB`,
    uploaded_by: user.id
  })
  
  if (dbError) return { error: dbError.message }
  
  revalidatePath(`/dashboard/deals/${dealId}`)
  return { success: true }
}

export async function deleteDealDocument(docId: string, url: string, dealId: string) {
  const supabase = await createClient()
  
  const pathParts = url.split('/invoices/')
  if (pathParts.length > 1) {
    const filePath = pathParts[1].split('?')[0]
    await supabase.storage.from('invoices').remove([filePath])
  }
  
  const { error } = await supabase.from('deal_documents').delete().eq('id', docId)
  if (error) return { error: error.message }
  
  revalidatePath(`/dashboard/deals/${dealId}`)
  return { success: true }
}
