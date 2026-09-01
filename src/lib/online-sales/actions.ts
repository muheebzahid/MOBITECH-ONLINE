'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit/actions'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createSupabaseAdmin(url, key)
}

const ORDERS_PAGE_SIZE = 10000

export async function getOnlineOrders(platform: 'AMAZON' | 'REVIBE', page: number = 0) {
  try {
    const adminClient = getAdminClient()
    const from = page * ORDERS_PAGE_SIZE
    const to = from + ORDERS_PAGE_SIZE - 1

    const [{ count }, { data, error }] = await Promise.all([
      adminClient
        .from('online_orders')
        .select('*', { count: 'exact', head: true })
        .eq('platform', platform),
      adminClient
        .from('online_orders')
        .select('*, items:online_order_items(*, inventory_items(id, imei, serial_number)), inventory_items(id, imei, serial_number)')
        .eq('platform', platform)
        .order('sale_date', { ascending: false })
        .range(from, to)
    ])

    if (error) {
      console.error('getOnlineOrders error:', error)
      return { data: [], total: 0 }
    }
    return { data: data || [], total: count || 0 }
  } catch (err: any) {
    console.error('getOnlineOrders exception:', err)
    return { data: [], total: 0 }
  }
}

export async function getOnlineOrderById(id: string) {
  try {
    const adminClient = getAdminClient()
    const { data, error } = await adminClient
      .from('online_orders')
      .select('*, items:online_order_items(*, inventory_items(*)), inventory_items(*)')
      .eq('id', id)
      .single()

    if (error) {
      console.error('getOnlineOrderById error:', error)
      return null
    }
    return data
  } catch (err: any) {
    console.error('getOnlineOrderById exception:', err)
    return null
  }
}

export async function getReadyItems() {
  try {
    const adminClient = getAdminClient()
    const { data, error } = await adminClient
      .from('inventory_items')
      .select('id, imei, serial_number, model, storage, grade')
      .eq('refurb_stage', 'READY_TO_SELL')

    if (error) {
      console.error('getReadyItems error:', error)
      return []
    }
    return data || []
  } catch (err: any) {
    console.error('getReadyItems exception:', err)
    return []
  }
}

export async function createOnlineOrder(platform: 'AMAZON' | 'REVIBE', formData: FormData, itemsJson: string) {
  try {
    const adminClient = getAdminClient()
    const orderNumber = formData.get('order_number') as string
    const customerName = formData.get('customer_name') as string
    const customerEmail = formData.get('customer_email') as string
    const saleDate = formData.get('sale_date') as string
    const totalAmount = parseFloat(formData.get('total_amount') as string) || 0

    if (!orderNumber) return { error: 'Order number is required' }

    // Insert order using admin client to bypass RLS restrictions
    const { data: order, error: orderErr } = await adminClient
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
      console.error('createOnlineOrder error:', orderErr)
      return { error: orderErr.message }
    }

    // Insert order items
    const items = JSON.parse(itemsJson || '[]')
    if (items.length > 0) {
      for (const item of items) {
        await adminClient
          .from('online_order_items')
          .insert({
            order_id: order.id,
            model: item.model,
            storage: item.storage || null,
            grade: item.grade || null,
            color: item.color || null,
            carrier: item.carrier || null,
            quantity: parseInt(item.quantity) || 1,
            unit_price: parseFloat(item.unit_price) || 0
          })
      }
    }

    await logAudit({
      tableName: 'online_orders',
      recordId: order.id,
      action: 'CREATE',
      newData: { order_number: orderNumber, platform, total_amount: totalAmount, customer_name: customerName }
    })

    try {
      revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
    } catch (e) {}

    return { success: true, orderId: String(order.id) }
  } catch (err: any) {
    console.error('createOnlineOrder exception:', err)
    return { error: err.message || 'Failed to create online order' }
  }
}

export async function updateOnlineOrderStatus(id: string, platform: string, status: string) {
  try {
    const adminClient = getAdminClient()
    const { error } = await adminClient
      .from('online_orders')
      .update({ status })
      .eq('id', id)

    if (error) return { error: error.message }
    
    if (status === 'DELIVERED') {
      await adminClient.from('inventory_items')
        .update({ status: 'SOLD', refurb_stage: 'SOLD' })
        .eq('online_order_id', id)
    } else if (status === 'CANCELLED') {
      await adminClient.from('inventory_items')
        .update({
          online_order_id: null,
          online_order_item_id: null,
          status: 'AVAILABLE',
          refurb_stage: 'READY_TO_SELL',
          location: 'DUBAI_WAREHOUSE'
        })
        .eq('online_order_id', id)
    } else {
      await adminClient.from('inventory_items')
        .update({ status: 'ASSIGNED', refurb_stage: 'ASSIGNED' })
        .eq('online_order_id', id)
    }

    await logAudit({
      tableName: 'online_orders',
      recordId: id,
      action: 'STATUS_CHANGE',
      newData: { status, platform }
    })

    revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
    revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}/${id}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Failed to update order status' }
  }
}

export async function deleteOnlineOrder(id: string, platform: string) {
  try {
    const adminClient = getAdminClient()
    
    // Find assigned inventory items first
    const { data: items } = await adminClient
      .from('inventory_items')
      .select('id')
      .eq('online_order_id', id)

    if (items && items.length > 0) {
      const itemIds = items.map(it => it.id)
      await adminClient
        .from('inventory_items')
        .update({
          online_order_id: null,
          online_order_item_id: null,
          status: 'AVAILABLE',
          refurb_stage: 'READY_TO_SELL',
          location: 'DUBAI_WAREHOUSE'
        })
        .in('id', itemIds)
    }

    const { error } = await adminClient
      .from('online_orders')
      .delete()
      .eq('id', id)

    if (error) return { error: error.message }
    revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Failed to delete order' }
  }
}

export async function assignImeiToOrderItem(orderId: string, orderItemId: string, imeiText: string, platform: 'AMAZON' | 'REVIBE') {
  try {
    const adminClient = getAdminClient()
    const trimmed = imeiText.trim()
    if (!trimmed) return { error: 'IMEI/Serial is required' }

    // 1. Search for IMEI in stock that is AVAILABLE
    const { data: item } = await adminClient
      .from('inventory_items')
      .select('*')
      .or(`imei.eq."${trimmed}",serial_number.eq."${trimmed}"`)
      .limit(1)
      .maybeSingle()

    const targetLocation = platform === 'AMAZON' ? 'AMAZON_FBA' : 'REVIBE'

    if (item) {
      // Check if it's already assigned to this order (no-op)
      if (item.online_order_id === orderId) {
        return { success: true }
      }
      // Check if it's already assigned somewhere else
      if (item.online_order_id && item.online_order_id !== orderId) {
        return { error: `IMEI already assigned to order ${item.online_order_id}` }
      }
      if (item.invoice_id) {
        return { error: 'IMEI already sold via wholesale invoice' }
      }
      // Enforce that device must be in READY_TO_SELL stage
      if (item.refurb_stage !== 'READY_TO_SELL') {
        return { error: `Device is not in READY_TO_SELL stage. Current stage: ${item.refurb_stage || 'None'}` }
      }

      // Assign existing item
      const { error: updateErr } = await adminClient
        .from('inventory_items')
        .update({
          online_order_id: orderId,
          online_order_item_id: orderItemId,
          status: 'ASSIGNED',
          refurb_stage: 'ASSIGNED',
          location: targetLocation
        })
        .eq('id', item.id)

      if (updateErr) return { error: updateErr.message }
    } else {
      // If not found in stock, let's create a new inventory item on the fly and mark it sold!
      const { data: orderItem } = await adminClient
        .from('online_order_items')
        .select('*')
        .eq('id', orderItemId)
        .single()

      if (!orderItem) return { error: 'Order SKU item not found' }

      // Find any existing deal_id to associate with as placeholder
      const { data: anyDeal } = await adminClient
        .from('deals')
        .select('id')
        .limit(1)
        .maybeSingle()

      if (!anyDeal) {
        return { error: 'Please create at least one Deal first to act as a placeholder for online sales inventory intake.' }
      }

      const { error: insertErr } = await adminClient
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
          status: 'ASSIGNED',
          refurb_stage: 'ASSIGNED',
          online_order_id: orderId,
          online_order_item_id: orderItemId
        })

      if (insertErr) {
        console.error('Error inserting new inventory item:', insertErr)
        return { error: insertErr.message }
      }
    }

    await logAudit({
      tableName: 'online_orders',
      recordId: orderId,
      action: 'IMEI_ASSIGNED',
      newData: { order_item_id: orderItemId, imei: trimmed, platform }
    })

    revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}/${orderId}`)
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Failed to assign IMEI' }
  }
}

export async function removeImeiFromOrderItem(orderId: string, itemId: string, platform: 'AMAZON' | 'REVIBE') {
  const supabase = await createClient()

  const { error } = await supabase
    .from('inventory_items')
    .update({
      online_order_id: null,
      online_order_item_id: null,
      status: 'AVAILABLE',
      refurb_stage: 'READY_TO_SELL',
      location: 'DUBAI_WAREHOUSE'
    })
    .eq('id', itemId)

  if (error) return { error: error.message }
  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}/${orderId}`)
  return { success: true }
}

export async function bulkCreateOnlineOrders(platform: 'AMAZON' | 'REVIBE', ordersData: any[]) {
  try {
    const supabase = await createClient()

    const ordersMap = new Map<string, any>()
    
    for (const row of ordersData) {
      const orderNum = row['Order Number']
      if (!orderNum) continue
      
      let safeDate = new Date().toISOString()
      const rawDate = row['Sale Date']
      if (rawDate) {
        let parsedDate = new Date()
        if (typeof rawDate === 'number') {
          parsedDate = new Date((rawDate - 25569) * 86400 * 1000)
        } else {
          parsedDate = new Date(rawDate)
        }
        if (!isNaN(parsedDate.getTime())) {
          safeDate = parsedDate.toISOString()
        }
      }
      
      if (!ordersMap.has(orderNum)) {
        ordersMap.set(orderNum, {
          order_number: String(orderNum).trim(),
          platform,
          customer_name: row['Customer Name'] || '',
          customer_email: row['Customer Email'] || '',
          sale_date: safeDate,
          items: []
        })
      }
      
      const qty = Number(row['Quantity']) || 1
      const unitPrice = Number(row['Unit Price']) || 0
      const imeisStr = row['IMEIs'] ? String(row['IMEIs']) : ''
      const imeisList = imeisStr.split(',').map(i => i.trim()).filter(Boolean)
      
      ordersMap.get(orderNum).items.push({
        model: row['Model'] || 'Unknown Model',
        storage: row['Storage'] || '',
        grade: row['Grade'] || '',
        color: row['Color'] || '',
        carrier: row['Carrier'] || '',
        quantity: qty,
        unit_price: unitPrice,
        imeis: imeisList
      })
    }

    const groupedOrders = Array.from(ordersMap.values())
    let createdCount = 0

    for (const gOrder of groupedOrders) {
      const { data: existing, error: findErr } = await supabase
        .from('online_orders')
        .select('id')
        .eq('order_number', gOrder.order_number)
        .eq('platform', platform)
        .maybeSingle()
      
      if (findErr) {
        return { error: `Failed checking existing order: ${findErr.message}` }
      }
      
      let orderId = existing?.id
      
      if (!orderId) {
        const totalAmount = gOrder.items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0)
        const { data: newOrder, error: orderErr } = await supabase.from('online_orders').insert({
          order_number: gOrder.order_number,
          platform,
          customer_name: gOrder.customer_name,
          customer_email: gOrder.customer_email,
          sale_date: gOrder.sale_date,
          total_amount: totalAmount,
          status: 'PENDING'
        }).select('id').single()
        
        if (orderErr) {
          return { error: `Failed creating order ${gOrder.order_number}: ${orderErr.message}` }
        }
        orderId = newOrder.id
        createdCount++
      }
      
      for (const item of gOrder.items) {
        const { data: newItem, error: itemErr } = await supabase.from('online_order_items').insert({
          order_id: orderId,
          model: item.model,
          storage: item.storage,
          grade: item.grade,
          color: item.color,
          carrier: item.carrier,
          quantity: item.quantity,
          unit_price: item.unit_price
        }).select('id').single()
        
        if (itemErr) {
          return { error: `Failed inserting order items: ${itemErr.message}` }
        }
        
        if (newItem && item.imeis.length > 0) {
          const imeisToLink = item.imeis.slice(0, item.quantity)
          for (const imei of imeisToLink) {
            await supabase.from('inventory_items')
              .update({
                online_order_id: orderId,
                online_order_item_id: newItem.id,
                status: 'ASSIGNED'
              })
              .eq('imei', imei)
              .is('online_order_id', null)
          }
        }
      }
    }

    revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
    return { success: true, count: createdCount }
  } catch (err: any) {
    console.error('bulkCreateOnlineOrders error:', err)
    return { error: err.message || 'An unexpected error occurred' }
  }
}

export async function bulkFulfillAndShipOrders(platform: 'AMAZON' | 'REVIBE', assignments: { orderId: string, orderItemId: string, imeis: string[] }[]) {
  const supabase = await createClient()
  
  const orderIdsToShip = new Set<string>()

  for (const a of assignments) {
    orderIdsToShip.add(a.orderId)
    if (a.imeis.length === 0) continue

    for (const imei of a.imeis) {
      if (!imei.trim()) continue
      
      const { error } = await supabase.from('inventory_items')
        .update({
          online_order_id: a.orderId,
          online_order_item_id: a.orderItemId,
          status: 'ASSIGNED'
        })
        .eq('imei', imei.trim())
        .is('online_order_id', null)
        
      if (error) {
        console.error('Error assigning IMEI:', imei, error)
      }
    }
  }

  for (const orderId of Array.from(orderIdsToShip)) {
    await supabase.from('online_orders')
      .update({ status: 'SHIPPED' })
      .eq('id', orderId)
  }

  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
  revalidatePath('/dashboard/inventory')
  return { success: true }
}

export async function bulkUpdateOnlineOrderStatus(platform: 'AMAZON' | 'REVIBE', orderIds: string[], status: string) {
  const supabase = await createClient()

  for (const id of orderIds) {
    const { error } = await supabase
      .from('online_orders')
      .update({ status })
      .eq('id', id)
      
    if (error) {
      console.error(`Error updating status for order ${id}:`, error.message)
      continue
    }

    if (status === 'DELIVERED') {
      await supabase.from('inventory_items')
        .update({ status: 'SOLD', refurb_stage: 'SOLD' })
        .eq('online_order_id', id)
    } else if (status === 'CANCELLED') {
      await supabase.from('inventory_items')
        .update({
          online_order_id: null,
          online_order_item_id: null,
          status: 'AVAILABLE',
          refurb_stage: 'READY_TO_SELL',
          location: 'DUBAI_WAREHOUSE'
        })
        .eq('online_order_id', id)
    } else if (status === 'SHIPPED') {
      await supabase.from('inventory_items')
        .update({ status: 'ASSIGNED', refurb_stage: 'ASSIGNED' })
        .eq('online_order_id', id)
    }
  }

  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
  revalidatePath('/dashboard/inventory')
  return { success: true }
}

export async function updateOnlineOrderSaleDate(id: string, platform: string, saleDate: string) {
  const supabase = await createClient()

  const safeDate = saleDate ? new Date(saleDate).toISOString() : new Date().toISOString()
  const { error } = await supabase
    .from('online_orders')
    .update({ sale_date: safeDate })
    .eq('id', id)

  if (error) {
    console.error(`Error updating sale date for order ${id}:`, error.message)
    return { error: error.message }
  }

  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}/${id}`)
  return { success: true }
}

export async function bulkUpdateOnlineOrderSaleDate(platform: string, orderIds: string[], saleDate: string) {
  const supabase = await createClient()

  if (!orderIds || orderIds.length === 0) return { success: true, count: 0 }
  const safeDate = saleDate ? new Date(saleDate).toISOString() : new Date().toISOString()

  const { error } = await supabase
    .from('online_orders')
    .update({ sale_date: safeDate })
    .in('id', orderIds)

  if (error) {
    console.error(`Error bulk updating sale dates:`, error.message)
    return { error: error.message }
  }

  revalidatePath(`/dashboard/online-sales/${platform.toLowerCase()}`)
  return { success: true, count: orderIds.length }
}
