'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getDealById } from '@/lib/deals/actions'
import { logAudit } from '@/lib/audit/actions'

const INVENTORY_PAGE_SIZE = 25

export async function getAllInventory(page: number = 0, search?: string) {
  const supabase = await createClient()

  if (search && search.trim() !== '') {
    const s = search.trim()
    const { data, error } = await supabase
      .from('inventory_items')
      .select(`
        *,
        deals(deal_number, supplier, model),
        invoices(invoice_number),
        online_orders(order_number, platform)
      `)
      .or(`imei.ilike.%${s}%,serial_number.ilike.%${s}%,model.ilike.%${s}%`)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getAllInventory search error:', error)
      return { data: [], total: 0, stageCounts: {} }
    }

    const stageCounts: Record<string, number> = {
      SEPARATED: 0,
      HANDED_TO_REFURBISH: 0,
      QC_DONE: 0,
      READY_TO_SELL: 0,
      ASSIGNED: 0,
      SOLD: 0
    }
    if (data) {
      for (const item of data) {
        if (item.refurb_stage) {
          stageCounts[item.refurb_stage] = (stageCounts[item.refurb_stage] || 0) + 1
        }
      }
    }

    return { data: data || [], total: data?.length || 0, stageCounts }
  }

  const from = page * INVENTORY_PAGE_SIZE
  const to = from + INVENTORY_PAGE_SIZE - 1

  const [{ count }, { data, error }, { data: stageData }] = await Promise.all([
    supabase.from('inventory_items').select('*', { count: 'exact', head: true }),
    supabase
      .from('inventory_items')
      .select(`
        *,
        deals(deal_number, supplier, model),
        invoices(invoice_number),
        online_orders(order_number, platform)
      `)
      .order('created_at', { ascending: false })
      .range(from, to),
    supabase.from('inventory_items').select('refurb_stage')
  ])

  if (error) {
    console.error('getAllInventory error:', error)
    return { data: [], total: 0, stageCounts: {} }
  }

  const stageCounts: Record<string, number> = {
    SEPARATED: 0,
    HANDED_TO_REFURBISH: 0,
    QC_DONE: 0,
    READY_TO_SELL: 0,
    ASSIGNED: 0,
    SOLD: 0
  }
  if (stageData) {
    for (const item of stageData) {
      if (item.refurb_stage) {
        stageCounts[item.refurb_stage] = (stageCounts[item.refurb_stage] || 0) + 1
      }
    }
  }

  return { data: data || [], total: count || 0, stageCounts }
}

export async function getInventoryByDeal(dealId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    
  if (error) return []
  return data || []
}

export async function addInventoryBulk(dealId: string, items: any[]) {
  const supabase = await createClient()
  
  // First, fetch the deal to calculate cost per unit
  const deal = await getDealById(dealId)
  if (!deal) return { error: 'Deal not found' }
  
  // Total cost of the deal (purchase price + auction fees + other fees)
  // We can calculate unit cost by dividing total commitment by quantity
  const base_unit_cost = deal.quantity > 0 ? parseFloat(((deal.total_commitment || 0) / deal.quantity).toFixed(2)) : 0

  // We should also look at logistics to add pro-rated shipping if any shipment is linked
  let logistics_cost = 0
  const { data: shipments } = await supabase
    .from('shipment_deals')
    .select('shipments(total_cost, total_units)')
    .eq('deal_id', dealId)

  if (shipments && shipments.length > 0) {
    // If the deal is part of a shipment, calculate pro-rated logistics cost
    // For simplicity, we just take the first shipment it belongs to
    const shipment = shipments[0].shipments as any
    if (shipment && shipment.total_units > 0) {
      logistics_cost = parseFloat((shipment.total_cost / shipment.total_units).toFixed(2))
    }
  }

  const payload = items.map(item => ({
    deal_id: dealId,
    imei: item.imei ? String(item.imei).trim() : null,
    serial_number: item.serial_number ? String(item.serial_number).trim() : null,
    model: item.model || deal.model,
    storage: item.storage || deal.storage,
    color: item.color || deal.color,
    grade: item.grade || deal.grade,
    unit_cost: base_unit_cost,
    logistics_cost: logistics_cost,
    location: 'DUBAI_WAREHOUSE', // Default intake location
    status: 'AVAILABLE'
  }))

  const { error } = await supabase
    .from('inventory_items')
    .insert(payload)

  if (error) {
    console.error('Bulk insert error:', error)
    // Sometimes unique constraints fail if IMEIs are duplicates
    return { error: error.message }
  }

  revalidatePath('/dashboard/inventory')
  revalidatePath(`/dashboard/deals/${dealId}`)
  return { success: true }
}

export async function updateInventoryLocation(itemId: string, newLocation: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Verify it exists
  const { data: item } = await supabase.from('inventory_items').select('*').eq('id', itemId).single()
  if (!item) return { error: 'Item not found' }

  // Update
  const { error } = await supabase
    .from('inventory_items')
    .update({ location: newLocation })
    .eq('id', itemId)

  if (error) return { error: error.message }

  // We don't need to manually log history here, because the PostgreSQL trigger
  // `after_inventory_change` automatically inserts a row in `inventory_history`
  
  // Optionally, if we want to log who changed it, we can update the history table
  // to set changed_by = user.id where item_id = itemId and changed_by is null.
  if (user) {
    await supabase.from('inventory_history')
      .update({ changed_by: user.id })
      .eq('item_id', itemId)
      .is('changed_by', null)
  }

  revalidatePath('/dashboard/inventory')
  return { success: true }
}

export async function updateRefurbStage(itemId: string, newStage: string, updates: { repair_cost?: number, qc_document_url?: string, notes?: string } = {}) {
  const supabase = await createClient()
  
  const { data: item } = await supabase.from('inventory_items').select('*').eq('id', itemId).single()

  const payload: any = { refurb_stage: newStage }
  if (updates.repair_cost !== undefined) payload.repair_cost = updates.repair_cost
  if (updates.qc_document_url !== undefined) payload.qc_document_url = updates.qc_document_url
  if (updates.notes !== undefined) payload.notes = updates.notes

  const { error } = await supabase
    .from('inventory_items')
    .update(payload)
    .eq('id', itemId)

  if (error) return { error: error.message }

  await logAudit({
    tableName: 'inventory_items',
    recordId: itemId,
    action: 'STATUS_CHANGE',
    oldData: item ? { refurb_stage: item.refurb_stage, repair_cost: item.repair_cost } : null,
    newData: payload
  })

  revalidatePath('/dashboard/inventory')
  return { success: true }
}

export async function deleteInventoryItem(itemId: string) {
  const supabase = await createClient()

  // 1. Get the item before deleting
  const { data: item } = await supabase.from('inventory_items').select('*').eq('id', itemId).single()
  if (!item) return { error: 'Item not found' }

  // 2. Delete the item
  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', itemId)

  if (error) {
    console.error('deleteInventoryItem error:', error)
    return { error: error.message }
  }

  // 3. Try to find an internal invoice line item that pulled this stock
  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('id, quantity, invoices!inner(customer_name)')
    .eq('deal_id', item.deal_id)
    .eq('invoices.customer_name', 'Internal - Online Inventory')
    .ilike('description', `%${item.model}%`)
    .gt('quantity', 0)
    .order('created_at', { ascending: false })
    .limit(1)

  if (lineItems && lineItems.length > 0) {
    const lineItem = lineItems[0]
    const newQty = lineItem.quantity - 1

    if (newQty <= 0) {
      await supabase.from('invoice_line_items').delete().eq('id', lineItem.id)
    } else {
      await supabase.from('invoice_line_items').update({ quantity: newQty }).eq('id', lineItem.id)
    }
  }

  revalidatePath('/dashboard/inventory')
  return { success: true }
}

export async function bulkDeleteInventoryItems(itemIds: string[]) {
  const supabase = await createClient()
  const results = []
  
  for (const itemId of itemIds) {
    // Process sequentially to avoid race conditions on the invoice_line_items decrement
    const res = await deleteInventoryItem(itemId)
    results.push(res)
  }
  
  return results
}

export async function updateInventoryItemImei(itemId: string, imei: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('inventory_items')
    .update({ imei: imei ? imei.trim() : null })
    .eq('id', itemId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/inventory')
  return { success: true }
}

export async function bulkUpdateInventoryItems(updates: { id: string, imei?: string, serial_number?: string, repair_cost?: number }[]) {
  const supabase = await createClient()
  
  for (const update of updates) {
    if (!update.id) continue
    
    const payload: any = {}
    if (update.imei !== undefined) payload.imei = update.imei ? String(update.imei).trim() : null
    if (update.serial_number !== undefined) payload.serial_number = update.serial_number ? String(update.serial_number).trim() : null
    if (update.repair_cost !== undefined && !isNaN(Number(update.repair_cost))) {
      payload.repair_cost = Number(update.repair_cost)
    }
    
    if (Object.keys(payload).length > 0) {
      await supabase
        .from('inventory_items')
        .update(payload)
        .eq('id', update.id)
    }
  }

  revalidatePath('/dashboard/inventory')
  return { success: true }
}
