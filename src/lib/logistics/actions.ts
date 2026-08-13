'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ShipmentStatus } from './constants'

const SHIPMENTS_PAGE_SIZE = 25

// ── List all shipments ───────────────────────────────────────
export async function getShipments(page: number = 0) {
  const supabase = await createClient()

  const from = page * SHIPMENTS_PAGE_SIZE
  const to = from + SHIPMENTS_PAGE_SIZE - 1

  const [{ count }, { data, error }] = await Promise.all([
    supabase.from('shipments').select('*', { count: 'exact', head: true }),
    supabase
      .from('shipments')
      .select(`
        *,
        shipment_deals(
          deal_id,
          deals(deal_number, model, quantity, total_commitment, status)
        )
      `)
      .order('created_at', { ascending: false })
      .range(from, to)
  ])

  if (error) {
    console.error('getShipments error:', error)
    return { data: [], total: 0 }
  }
  return { data: data || [], total: count || 0 }
}

// ── Get single shipment ──────────────────────────────────────
export async function getShipmentById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('shipments')
    .select(`
      *,
      shipment_deals(
        deal_id,
        deals(id, deal_number, model, storage, grade, carrier, color, quantity, total_commitment, status, auction_won_date)
      ),
      shipment_documents(*)
    `)
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data
}

// ── Create shipment ──────────────────────────────────────────
export async function createShipment(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const dealIds = formData.getAll('deal_ids') as string[]

  const payload = {
    shipment_number: '',       // triggers auto-generation
    status: 'PENDING' as ShipmentStatus,
    carrier:           formData.get('carrier')            as string || null,
    awb_number:        formData.get('awb_number')         as string || null,
    sb_invoice_number: formData.get('sb_invoice_number')  as string || null,
    sb_fee:            parseFloat(formData.get('sb_fee') as string) || 0,
    usa_to_usa_cost:   parseFloat(formData.get('usa_to_usa_cost') as string) || 0,
    usa_to_dxb_cost:   parseFloat(formData.get('usa_to_dxb_cost') as string) || 0,
    freight_cost:      (parseFloat(formData.get('usa_to_usa_cost') as string) || 0) + (parseFloat(formData.get('usa_to_dxb_cost') as string) || 0),
    duty_amount:       parseFloat(formData.get('duty_amount') as string) || 0,
    turbo_fee:         parseFloat(formData.get('turbo_fee') as string) || 0,
    pickup_date:       formData.get('pickup_date')        as string || null,
    pickup_ref:        formData.get('pickup_ref')         as string || null,
    notes:             formData.get('notes')              as string || null,
    created_by: user.id,
  }

  const { data: shipment, error } = await supabase
    .from('shipments')
    .insert(payload)
    .select()
    .single()

  if (error) return { error: error.message }

  // Upload documents if attached
  const filesToUpload: File[] = []
  const documentsList = formData.getAll('documents') as File[]
  if (documentsList.length > 0) {
    filesToUpload.push(...documentsList)
  }
  const singleDoc = formData.get('document') as File | null
  if (singleDoc && singleDoc.size > 0) {
    filesToUpload.push(singleDoc)
  }

  for (const documentFile of filesToUpload) {
    if (documentFile && documentFile.size > 0) {
      const fileExt = documentFile.name.split('.').pop()
      const fileName = `${shipment.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('shipments')
        .upload(fileName, documentFile)

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('shipments')
          .getPublicUrl(fileName)

        await supabase.from('shipment_documents').insert({
          shipment_id: shipment.id,
          name: documentFile.name,
          file_url: publicUrl
        })
      }
    }
  }

  // Link deals to shipment
  if (dealIds.length > 0) {
    const links = dealIds.map(deal_id => ({
      shipment_id: shipment.id,
      deal_id,
    }))
    await supabase.from('shipment_deals').insert(links)
  }

  revalidatePath('/dashboard/logistics')
  return { success: true, shipment }
}

// ── Update shipment status ───────────────────────────────────
export async function updateShipmentStatus(
  shipmentId: string,
  newStatus: ShipmentStatus,
  extraFields?: Record<string, any>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Auto-set date fields when status advances
  const autoDateMap: Record<string, string> = {
    AT_SB_TECHNOLOGY:       'pickup_date',
    SHIPPED_FROM_USA:       'shipped_usa_date',
    ARRIVED_DUBAI:          'arrived_dubai_date',
    CUSTOMS_CLEARED:        'customs_cleared_date',
    AT_TURBO_LOGISTICS:     'turbo_received_date',
    DELIVERED_TO_MOBITECH:  'delivered_mobitech_date',
  }

  const updatePayload: Record<string, any> = {
    status: newStatus,
    ...extraFields,
  }

  if (autoDateMap[newStatus] && !updatePayload[autoDateMap[newStatus]]) {
    updatePayload[autoDateMap[newStatus]] = new Date().toISOString().split('T')[0]
  }

  const { error } = await supabase
    .from('shipments')
    .update(updatePayload)
    .eq('id', shipmentId)

  if (error) return { error: error.message }

  // If delivered, also update linked deals to RECEIVED_BY_MOBITECH
  if (newStatus === 'DELIVERED_TO_MOBITECH') {
    const { data: links } = await supabase
      .from('shipment_deals')
      .select('deal_id')
      .eq('shipment_id', shipmentId)

    if (links && links.length > 0) {
      const dealIds = links.map(l => l.deal_id)
      await supabase
        .from('deals')
        .update({
          status: 'RECEIVED_BY_MOBITECH',
          received_mobitech_date: new Date().toISOString(),
        })
        .in('id', dealIds)

      // Log status history for each deal
      const historyEntries = dealIds.map(deal_id => ({
        deal_id,
        old_status: null,
        new_status: 'RECEIVED_BY_MOBITECH',
        notes: `Auto-advanced via shipment ${shipmentId}`,
        changed_by: user.id,
      }))
      await supabase.from('deal_status_history').insert(historyEntries)
    }
  }

  revalidatePath('/dashboard/logistics')
  revalidatePath(`/dashboard/logistics/${shipmentId}`)
  return { success: true }
}

// ── Update shipment details (edit) ───────────────────────────
export async function updateShipment(shipmentId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const payload: Record<string, any> = {
    carrier:              formData.get('carrier')              || null,
    awb_number:           formData.get('awb_number')           || null,
    sb_invoice_number:    formData.get('sb_invoice_number')    || null,
    sb_fee:               parseFloat(formData.get('sb_fee') as string) || 0,
    usa_to_usa_cost:      parseFloat(formData.get('usa_to_usa_cost') as string) || 0,
    usa_to_dxb_cost:      parseFloat(formData.get('usa_to_dxb_cost') as string) || 0,
    freight_cost:         (parseFloat(formData.get('usa_to_usa_cost') as string) || 0) + (parseFloat(formData.get('usa_to_dxb_cost') as string) || 0),
    duty_amount:          parseFloat(formData.get('duty_amount') as string) || 0,
    turbo_fee:            parseFloat(formData.get('turbo_fee') as string) || 0,
    pickup_date:          formData.get('pickup_date')          || null,
    pickup_ref:           formData.get('pickup_ref')           || null,
    shipped_usa_date:     formData.get('shipped_usa_date')     || null,
    arrived_dubai_date:   formData.get('arrived_dubai_date')   || null,
    customs_ref:          formData.get('customs_ref')          || null,
    customs_cleared_date: formData.get('customs_cleared_date') || null,
    turbo_received_date:  formData.get('turbo_received_date')  || null,
    turbo_invoice_number: formData.get('turbo_invoice_number') || null,
    delivered_mobitech_date: formData.get('delivered_mobitech_date') || null,
    condition_notes:      formData.get('condition_notes')      || null,
    notes:                formData.get('notes')                || null,
  }

  const { error } = await supabase
    .from('shipments')
    .update(payload)
    .eq('id', shipmentId)

  if (error) return { error: error.message }

  // Propagate updated logistics cost to scanned inventory items
  const totalLogisticsCost = Number(payload.sb_fee || 0) + Number(payload.freight_cost || 0) + Number(payload.duty_amount || 0) + Number(payload.turbo_fee || 0)
  const { data: shipmentDeals } = await supabase
    .from('shipment_deals')
    .select('deal_id, deals(quantity)')
    .eq('shipment_id', shipmentId)

  if (shipmentDeals && shipmentDeals.length > 0) {
    const totalShipmentUnits = shipmentDeals.reduce((sum: number, sd: any) => sum + (sd.deals?.quantity || 0), 0)
    const shippingCostPerUnit = totalShipmentUnits > 0 ? (totalLogisticsCost / totalShipmentUnits) : 0

    for (const sd of shipmentDeals) {
      if (sd.deal_id) {
        await supabase
          .from('inventory_items')
          .update({ logistics_cost: shippingCostPerUnit })
          .eq('deal_id', sd.deal_id)
      }
    }
  }

  // Upload documents if attached
  const filesToUpload: File[] = []
  const documentsList = formData.getAll('documents') as File[]
  if (documentsList.length > 0) {
    filesToUpload.push(...documentsList)
  }
  const singleDoc = formData.get('document') as File | null
  if (singleDoc && singleDoc.size > 0) {
    filesToUpload.push(singleDoc)
  }

  for (const documentFile of filesToUpload) {
    if (documentFile && documentFile.size > 0) {
      const fileExt = documentFile.name.split('.').pop()
      const fileName = `${shipmentId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('shipments')
        .upload(fileName, documentFile)

      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('shipments')
          .getPublicUrl(fileName)

        await supabase.from('shipment_documents').insert({
          shipment_id: shipmentId,
          name: documentFile.name,
          file_url: publicUrl
        })
      }
    }
  }

  revalidatePath('/dashboard/logistics')
  revalidatePath(`/dashboard/logistics/${shipmentId}`)
  return { success: true }
}

// ── Remove shipment document ─────────────────────────────────
export async function removeShipmentDocument(documentId: string, fileUrl: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const fileName = fileUrl.split('/').pop()
  if (fileName) {
    await supabase.storage.from('shipments').remove([fileName])
  }

  const { error } = await supabase
    .from('shipment_documents')
    .delete()
    .eq('id', documentId)

  if (error) return { error: error.message }
  return { success: true }
}

// ── Add deal to existing shipment ────────────────────────────
export async function addDealToShipment(shipmentId: string, dealId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('shipment_deals')
    .insert({ shipment_id: shipmentId, deal_id: dealId })
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/logistics/${shipmentId}`)
  return { success: true }
}

// ── Remove deal from shipment ────────────────────────────────
export async function removeDealFromShipment(shipmentId: string, dealId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('shipment_deals')
    .delete()
    .eq('shipment_id', shipmentId)
    .eq('deal_id', dealId)
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/logistics/${shipmentId}`)
  return { success: true }
}

// ── Get deals not yet in any shipment (for adding to new shipment) ──
export async function getUnshippedDeals() {
  const supabase = await createClient()

  // Get all deal IDs already linked to a shipment
  const { data: linked } = await supabase
    .from('shipment_deals')
    .select('deal_id')

  const linkedIds = (linked || []).map(l => l.deal_id)

  // Get deals that are active (not closed) and not yet shipped
  let query = supabase
    .from('deals')
    .select('id, deal_number, model, storage, grade, quantity, total_commitment, status, auction_won_date')
    .not('status', 'eq', 'DEAL_CLOSED')
    .order('created_at', { ascending: false })

  if (linkedIds.length > 0) {
    query = query.not('id', 'in', `(${linkedIds.join(',')})`)
  }

  const { data, error } = await query
  if (error) return []
  return data || []
}

// ── Delete shipment ──────────────────────────────────────────
export async function deleteShipment(shipmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { getUserRole } = await import('@/lib/admin/actions')
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') return { error: 'Unauthorized to delete shipments.' }

  const { createClient: createSupabaseAdmin } = await import('@supabase/supabase-js')
  const supabaseAdmin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabaseAdmin.from('shipments').delete().eq('id', shipmentId)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/logistics')
  return { success: true }
}

export async function updateShipmentHandler(shipmentId: string, handledBy: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('shipments')
    .update({ handled_by: handledBy })
    .eq('id', shipmentId)
    
  if (error) return { error: error.message }
  revalidatePath('/dashboard/logistics')
  return { success: true }
}
