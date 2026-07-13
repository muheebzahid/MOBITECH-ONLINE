'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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
  
  const auction_fee_pct = parseFloat(formData.get('auction_fee_pct') as string) || 2
  const other_fees      = parseFloat(formData.get('other_fees') as string) || 0
  const funding_source  = formData.get('funding_source') as string
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
  } else if (funding_source === 'CASH_POOL') {
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

  const updatePayload: Record<string, string> = { status: newStatus }
  if (timestampField[newStatus]) {
    updatePayload[timestampField[newStatus]] = dateOverride ? new Date(dateOverride).toISOString() : new Date().toISOString()
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

  revalidatePath('/dashboard/deals')
  revalidatePath(`/dashboard/deals/${dealId}`)
  return { success: true }
}

export async function syncDealSoldStatus(dealId: string) {
  const supabase = await createClient()
  
  // Get deal
  const { data: deal } = await supabase.from('deals').select('id, quantity, status').eq('id', dealId).single()
  if (!deal) return

  // Get valid line items
  const { data: lineItems } = await supabase.from('invoice_line_items')
    .select('quantity, invoices(status)')
    .eq('deal_id', dealId)

  const invoicedQty = (lineItems || [])
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

  if (newStatus !== deal.status) {
    await supabase.from('deals').update({ status: newStatus }).eq('id', dealId)
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
    revalidatePath(`/dashboard/deals/${dealId}`)
    revalidatePath('/dashboard/deals')
  }
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

export async function getDeals() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deals')
    .select('*, items:deal_items(*), shipment_deals(shipments(id, shipment_number, total_logistics_cost, shipment_deals(deals(quantity)))), invoice_line_items(quantity, unit_price, invoices(id, status, amount_paid))')
    .order('created_at', { ascending: false })
  if (error) return []
  return data
}

export async function getDealById(id: string) {
  const supabase = await createClient()

  // Fetch core deal + status history + invoices + inventory + items + shipment info with sibling deals
  const { data, error } = await supabase
    .from('deals')
    .select(`*, items:deal_items(*), deal_status_history(*), invoice_line_items(*, invoices(*)), inventory_items(*), shipment_deals(shipments(*, shipment_deals(deal_id, deals(id, deal_number, status))))`)
    .eq('id', id)
    .single()

  if (error || !data) return null

  // Fetch edit history separately (table may not exist yet — fail gracefully)
  const { data: editHistory } = await supabase
    .from('deal_edit_history')
    .select('*')
    .eq('deal_id', id)
    .order('edited_at', { ascending: false })

  return { ...data, deal_edit_history: editHistory || [] }
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
  
  const auction_fee_pct   = parseFloat(formData.get('auction_fee_pct') as string) || 2
  const other_fees        = parseFloat(formData.get('other_fees') as string) || 0
  const funding_source    = formData.get('funding_source') as string
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
  else if (funding_source === 'CASH_POOL') cash_amount = total_commitment
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

  // Sync items
  if (items) {
    // Delete old items
    await supabase.from('deal_items').delete().eq('deal_id', dealId)
    // Insert new items
    if (items.length > 0) {
      const itemsToInsert = items.map(i => ({
        deal_id: dealId,
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
    field_changes.push({
      field: 'items',
      label: 'Line Items',
      old_value: `${current.items?.length || 0} items`,
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
  
  // To avoid duplicate deal numbers, we fetch the current count for the year
  const { count } = await supabase
    .from('deals')
    .select('*', { count: 'exact', head: true })
    .ilike('deal_number', `%-${year}-%`)

  let startSeq = (count || 0) + 1

  const newDeals = dealsData.map((d, index) => {
    const supplier = String(d.vendor || 'OTHER').toUpperCase()
    const prefix = supplier === 'ECOATM' ? 'ECO' : supplier === 'ATT' ? 'ATT' : 'DL'
    const seq = String(startSeq + index).padStart(4, '0')
    const deal_number = `${prefix}-${year}-${seq}`

    const quantity = parseInt(d.quantity) || 1
    const unit_cost = parseFloat(d.unit_cost) || 0
    const total_cost = unit_cost * quantity
    const total_commitment = total_cost
    
    let dealDate = new Date()
    if (d.date) {
      const parsedDate = new Date(d.date)
      if (!isNaN(parsedDate.getTime())) {
        dealDate = parsedDate
      }
    }

    return {
      deal_number,
      supplier: d.vendor || 'OTHER',
      auction_platform: 'DIRECT', // default for bulk uploads
      model: d.model || 'Unknown',
      storage: d.storage || null,
      grade: d.grade || null,
      quantity,
      unit_cost,
      total_cost,
      auction_fee: 0,
      other_fees: 0,
      total_commitment,
      funding_source: 'CASH_POOL',
      amex_amount: 0,
      cash_amount: total_commitment,
      status: 'AUCTION_WON',
      auction_won_date: dealDate.toISOString(),
      created_at: dealDate.toISOString(),
      notes: d.condition ? `Condition: ${d.condition}` : null,
      created_by: user.id,
    }
  })

  const { data: insertedDeals, error } = await supabase.from('deals').insert(newDeals).select()
  
  if (error) return { error: error.message }
  
  // Also insert the single line item for each bulk deal to keep the schema happy
  if (insertedDeals && insertedDeals.length > 0) {
    const itemsToInsert = insertedDeals.map((deal, i) => {
      const sourceData = dealsData[i]
      return {
        deal_id: deal.id,
        model: deal.model,
        storage: deal.storage || null,
        grade: deal.grade || null,
        carrier: sourceData.carrier || null,
        color: sourceData.color || null,
        quantity: deal.quantity,
        unit_cost: deal.unit_cost
      }
    })
    await supabase.from('deal_items').insert(itemsToInsert)
  }
  
  revalidatePath('/dashboard/deals')
  return { success: true, count: newDeals.length }
}
