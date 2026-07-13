'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getDealById } from '@/lib/deals/actions'

export async function getAllInventory() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      *,
      deals(deal_number, supplier, model),
      invoices(invoice_number)
    `)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('getAllInventory error:', error)
    return []
  }
  return data || []
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
