'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getOnlineOrders(platform: 'AMAZON' | 'REVIBE') {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('online_orders')
    .select('*, items:online_order_items(*), inventory_items(id, imei, serial_number)')
    .eq('platform', platform)
    .order('sale_date', { ascending: false })

  if (error) {
    console.error('getOnlineOrders error:', error)
    return []
  }
  return data || []
}

export async function getOnlineOrderById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('online_orders')
    .select('*, items:online_order_items(*), inventory_items(*)')
    .eq('id', id)
    .single()

  if (error) {
    console.error('getOnlineOrderById error:', error)
    return null
  }
  return data
}

export async function createOnlineOrder(platform: 'AMAZON' | 'REVIBE', formData: FormData, itemsJson: string) {
  const supabase = await createClient()
  const orderNumber = formData.get('order_number') as string
  const customerName = formData.get('customer_name') as string
  const customerEmail = formData.get('customer_email') as string
  const saleDate = formData.get('sale_date') as string
  const totalAmount = parseFloat(formData.get('total_amount') as string) || 0

  if (!orderNumber) return { error: 'Order number is required' }

  // Insert order
  const { data: order, error: orderErr } = await supabase
    .from('online_orders')
    .insert({
      order_number: orderNumber,
      platform,
      customer_name: customerName || null,
      customer_email: customerEmail || null,
      sale_date: saleDate ? new Date(saleDate).toISOString() : new Date().toISOString(),
      total_amount: totalAmount,
      status: 'PENDING'
    })
    .select()
    .single()

  if (orderErr) {
    return { error: orderErr.message }
  }

  // Insert order items and update inventory_items
  const items = JSON.parse(itemsJson || '[]') // Array of { id: string, model: string, storage: string, grade: string, color: string, carrier: string, unit_price: number }
  if (items.length > 0) {
    // Group by model/storage/grade to create online_order_items lines
    const grouped = new Map<string, any>()
    for (const it of items) {
      const key = `${it.model}|${it.storage}|${it.grade}|${it.color}|${it.carrier}|${it.unit_price}`
      if (grouped.has(key)) {
        grouped.get(key).quantity += 1
        grouped.get(key).inventory_ids.push(it.id)
      } else {
        grouped.set(key, { ...it, quantity: 1, inventory_ids: [it.id] })
      }
    }

    for (const group of Array.from(grouped.values())) {
      const { data: orderItem, error: itemErr } = await supabase
        .from('online_order_items')
        .insert({
          order_id: order.id,
          model: group.model,
          storage: group.storage || null,
          grade: group.grade || null,
          color: group.color || null,
          carrier: group.carrier || null,
          quantity: group.quantity,
          unit_price: parseFloat(group.unit_price) || 0
        })
        .select()
        .single()
      
      if (!itemErr && orderItem) {
        // Link inventory_items
        await supabase
          .from('inventory_items')
          .update({
            status: 'SOLD',
            location: platform === 'AMAZON' ? 'AMAZON_FBA' : 'REVIBE',
            online_order_id: order.id,
            online_order_item_id: orderItem.id
          })
          .in('id', group.inventory_ids)
      }
    }
  }

  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
  return { success: true, order }
}

export async function updateOnlineOrderStatus(id: string, platform: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('online_orders')
    .update({ status })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}/${id}`)
  return { success: true }
}

export async function deleteOnlineOrder(id: string, platform: string) {
  const supabase = await createClient()
  
  // Find assigned inventory items first
  const { data: items } = await supabase
    .from('inventory_items')
    .select('id')
    .eq('online_order_id', id)

  if (items && items.length > 0) {
    const itemIds = items.map(it => it.id)
    await supabase
      .from('inventory_items')
      .update({
        online_order_id: null,
        online_order_item_id: null,
        status: 'AVAILABLE',
        location: 'DUBAI_WAREHOUSE'
      })
      .in('id', itemIds)
  }

  const { error } = await supabase
    .from('online_orders')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
  return { success: true }
}

export async function assignImeiToOrderItem(orderId: string, orderItemId: string, imeiText: string, platform: 'AMAZON' | 'REVIBE') {
  const supabase = await createClient()
  const trimmed = imeiText.trim()
  if (!trimmed) return { error: 'IMEI/Serial is required' }

  // 1. Search for IMEI in stock that is AVAILABLE
  const { data: item } = await supabase
    .from('inventory_items')
    .select('*')
    .or(`imei.eq."${trimmed}",serial_number.eq."${trimmed}"`)
    .limit(1)
    .maybeSingle()

  const targetLocation = platform === 'AMAZON' ? 'AMAZON_FBA' : 'REVIBE'

  if (item) {
    // Check if it's already assigned somewhere else
    if (item.online_order_id && item.online_order_id !== orderId) {
      return { error: `IMEI already assigned to order ${item.online_order_id}` }
    }
    if (item.invoice_id) {
      return { error: 'IMEI already sold via wholesale invoice' }
    }

    // Assign existing item
    const { error: updateErr } = await supabase
      .from('inventory_items')
      .update({
        online_order_id: orderId,
        online_order_item_id: orderItemId,
        status: 'SOLD',
        location: targetLocation
      })
      .eq('id', item.id)

    if (updateErr) return { error: updateErr.message }
  } else {
    // If not found in stock, let's create a new inventory item on the fly and mark it sold!
    const { data: orderItem } = await supabase
      .from('online_order_items')
      .select('*')
      .eq('id', orderItemId)
      .single()

    if (!orderItem) return { error: 'Order SKU item not found' }

    // Find any existing deal_id to associate with as placeholder
    const { data: anyDeal } = await supabase
      .from('deals')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (!anyDeal) {
      return { error: 'Please create at least one Deal first to act as a placeholder for online sales inventory intake.' }
    }

    const { error: insertErr } = await supabase
      .from('inventory_items')
      .insert({
        deal_id: anyDeal.id,
        imei: trimmed,
        model: orderItem.model,
        storage: orderItem.storage || null,
        grade: orderItem.grade || null,
        color: orderItem.color || null,
        carrier: orderItem.carrier || null,
        unit_cost: 0,
        logistics_cost: 0,
        location: targetLocation,
        status: 'SOLD',
        online_order_id: orderId,
        online_order_item_id: orderItemId
      })

    if (insertErr) {
      console.error('Error inserting new inventory item:', insertErr)
      return { error: insertErr.message }
    }
  }

  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}/${orderId}`)
  return { success: true }
}

export async function removeImeiFromOrderItem(orderId: string, itemId: string, platform: 'AMAZON' | 'REVIBE') {
  const supabase = await createClient()

  const { error } = await supabase
    .from('inventory_items')
    .update({
      online_order_id: null,
      online_order_item_id: null,
      status: 'AVAILABLE',
      location: 'DUBAI_WAREHOUSE'
    })
    .eq('id', itemId)

  if (error) return { error: error.message }
  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}/${orderId}`)
  return { success: true }
}
