'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ── Invoices ────────────────────────────────────────────────
export async function getInvoices() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invoices')
    .select(`*, invoice_line_items(quantity, description, deals(id, deal_number, model))`)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('getInvoices error:', error)
    return []
  }
  return data || []
}

export async function getInvoiceById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invoices')
    .select(`
      *,
      invoice_line_items(*, deals(deal_number, model, storage, grade)),
      payments(*)
    `)
    .eq('id', id)
    .single()
    
  if (error || !data) return null
  return data
}

export async function createInvoice(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const customerName = formData.get('customer_name') as string
  const customerEmail = formData.get('customer_email') as string || null
  const customerAddress = formData.get('customer_address') as string || null
  const customerPhone = formData.get('customer_phone') as string || null

  let clientId = null
  if (customerName) {
    // Check if client exists
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, email, phone, address')
      .eq('name', customerName.trim())
      .maybeSingle()

    if (existingClient) {
      clientId = existingClient.id
      // Update details in client account if they are currently blank
      const updates: Record<string, any> = {}
      if (!existingClient.email && customerEmail) updates.email = customerEmail
      if (!existingClient.phone && customerPhone) updates.phone = customerPhone
      if (!existingClient.address && customerAddress) updates.address = customerAddress
      
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString()
        await supabase.from('clients').update(updates).eq('id', clientId)
      }
    } else {
      // Create new client account
      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .insert({
          name: customerName.trim(),
          email: customerEmail,
          phone: customerPhone,
          address: customerAddress
        })
        .select('id')
        .single()

      if (!clientErr && newClient) {
        clientId = newClient.id
      }
    }
  }

  const payload = {
    customer_name:    customerName,
    customer_email:   customerEmail,
    customer_address: customerAddress,
    customer_phone:   customerPhone,
    client_id:        clientId,
    issue_date:       formData.get('issue_date') as string || new Date().toISOString().split('T')[0],
    due_date:         formData.get('due_date') as string || null,
    notes:            formData.get('notes') as string || null,
    created_by:       user.id
  }

  const { data, error } = await supabase
    .from('invoices')
    .insert(payload)
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/dashboard/sales')
  revalidatePath('/dashboard/clients')
  return { success: true, invoice: data }
}

export async function uploadInvoiceDocument(invoiceId: string, formData: FormData) {
  const file = formData.get('file') as File
  if (!file) return { error: 'No file provided' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const fileExt = file.name.split('.').pop()
  const fileName = `${invoiceId}-${Date.now()}.${fileExt}`
  const { error: uploadError } = await supabase.storage
    .from('invoices')
    .upload(fileName, file)
  
  if (uploadError) return { error: uploadError.message }

  const { data: { publicUrl } } = supabase.storage
    .from('invoices')
    .getPublicUrl(fileName)

  const { error: updateError } = await supabase
    .from('invoices')
    .update({ pdf_url: publicUrl })
    .eq('id', invoiceId)

  if (updateError) return { error: updateError.message }

  revalidatePath(`/dashboard/sales/${invoiceId}`)
  revalidatePath('/dashboard/sales')
  return { success: true, url: publicUrl }
}

export async function removeInvoiceDocument(invoiceId: string, pdfUrl: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const fileName = pdfUrl.split('/').pop()
  if (fileName) {
    await supabase.storage.from('invoices').remove([fileName])
  }

  const { error } = await supabase.from('invoices').update({ pdf_url: null }).eq('id', invoiceId)
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/sales/${invoiceId}`)
  return { success: true }
}

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export async function deleteInvoice(invoiceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Must be SUPER_ADMIN to delete
  const { getUserRole } = await import('@/lib/admin/actions')
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') return { error: 'Unauthorized to delete invoices.' }

  // Bypass RLS to force delete from everywhere
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: items } = await supabaseAdmin.from('invoice_line_items').select('deal_id').eq('invoice_id', invoiceId)
  const dealIds = items ? Array.from(new Set(items.map((i: any) => i.deal_id).filter(Boolean))) : []

  const { error } = await supabaseAdmin.from('invoices').delete().eq('id', invoiceId)
  if (error) return { error: error.message }

  if (dealIds.length > 0) {
    const { syncDealSoldStatus } = await import('@/lib/deals/actions')
    for (const dId of dealIds) await syncDealSoldStatus(dId as string)
  }

  revalidatePath('/dashboard/sales')
  return { success: true }
}

export async function issueInvoice(id: string) {
  const supabase = await createClient()
  const { data: items } = await supabase.from('invoice_line_items').select('deal_id').eq('invoice_id', id)
  const dealIds = items ? Array.from(new Set(items.map((i: any) => i.deal_id).filter(Boolean))) : []

  const { error } = await supabase
    .from('invoices')
    .update({ status: 'ISSUED' })
    .eq('id', id)
    .eq('status', 'DRAFT') // Only issue if draft

  if (error) return { error: error.message }

  if (dealIds.length > 0) {
    const { syncDealSoldStatus } = await import('@/lib/deals/actions')
    for (const dId of dealIds) await syncDealSoldStatus(dId as string)
  }

  revalidatePath('/dashboard/sales')
  revalidatePath(`/dashboard/sales/${id}`)
  return { success: true }
}

export async function updateInvoiceStatus(id: string, newStatus: string) {
  const supabase = await createClient()
  const { data: items } = await supabase.from('invoice_line_items').select('deal_id').eq('invoice_id', id)
  const dealIds = items ? Array.from(new Set(items.map((i: any) => i.deal_id).filter(Boolean))) : []

  const { error } = await supabase
    .from('invoices')
    .update({ status: newStatus })
    .eq('id', id)

  if (error) return { error: error.message }

  if (dealIds.length > 0) {
    const { syncDealSoldStatus } = await import('@/lib/deals/actions')
    for (const dId of dealIds) await syncDealSoldStatus(dId as string)
  }

  revalidatePath('/dashboard/sales')
  revalidatePath(`/dashboard/sales/${id}`)
  return { success: true }
}

export async function updateInvoiceNumber(id: string, invoiceNumber: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('invoices')
    .update({ invoice_number: invoiceNumber })
    .eq('id', id)
    
  if (error) throw error
  revalidatePath('/dashboard/sales')
  revalidatePath(`/dashboard/sales/${id}`)
}


// ── Line Items ──────────────────────────────────────────────
export async function addLineItem(invoiceId: string, formData: FormData) {
  const supabase = await createClient()
  
  const dealId = formData.get('deal_id') as string || null
  const dealItemId = formData.get('deal_item_id') as string || null
  const description = formData.get('description') as string
  const quantity = parseInt(formData.get('quantity') as string) || 1
  const unitPrice = parseFloat(formData.get('unit_price') as string) || 0

  const payload: any = {
    invoice_id: invoiceId,
    deal_id: dealId === '' ? null : dealId,
    description,
    quantity,
    unit_price: unitPrice
  }
  
  if (dealItemId && dealItemId !== '') {
    payload.deal_item_id = dealItemId
  }

  const { error } = await supabase.from('invoice_line_items').insert(payload)
  if (error) return { error: error.message }
  
  if (dealId) {
    const { syncDealSoldStatus } = await import('@/lib/deals/actions')
    await syncDealSoldStatus(dealId)
  }

  revalidatePath(`/dashboard/sales/${invoiceId}`)
  revalidatePath('/dashboard/sales')
  return { success: true }
}

export async function removeLineItem(invoiceId: string, lineItemId: string) {
  const supabase = await createClient()
  const { data: oldItem } = await supabase.from('invoice_line_items').select('deal_id').eq('id', lineItemId).single()

  const { error } = await supabase
    .from('invoice_line_items')
    .delete()
    .eq('id', lineItemId)
    .eq('invoice_id', invoiceId)
    
  if (error) return { error: error.message }
  
  if (oldItem?.deal_id) {
    const { syncDealSoldStatus } = await import('@/lib/deals/actions')
    await syncDealSoldStatus(oldItem.deal_id)
  }

  revalidatePath(`/dashboard/sales/${invoiceId}`)
  revalidatePath('/dashboard/sales')
  return { success: true }
}

export async function updateLineItemDeal(invoiceId: string, lineItemId: string, dealId: string | null, dealItemId: string | null = null) {
  const supabase = await createClient()
  const { data: oldItem } = await supabase.from('invoice_line_items').select('deal_id').eq('id', lineItemId).single()

  const payload: any = { deal_id: dealId || null }
  payload.deal_item_id = dealItemId || null

  const { error } = await supabase
    .from('invoice_line_items')
    .update(payload)
    .eq('id', lineItemId)
    .eq('invoice_id', invoiceId)
    
  if (error) return { error: error.message }
  
  const { syncDealSoldStatus } = await import('@/lib/deals/actions')
  if (oldItem?.deal_id) await syncDealSoldStatus(oldItem.deal_id)
  if (dealId) await syncDealSoldStatus(dealId)

  revalidatePath(`/dashboard/sales/${invoiceId}`)
  revalidatePath('/dashboard/sales')
  return { success: true }
}

// ── Payments ────────────────────────────────────────────────
export async function recordPayment(invoiceId: string, formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const payload = {
    invoice_id:       invoiceId,
    amount:           parseFloat(formData.get('amount') as string) || 0,
    payment_date:     formData.get('payment_date') as string || new Date().toISOString().split('T')[0],
    payment_method:   formData.get('payment_method') as string,
    reference_number: formData.get('reference_number') as string || null,
    notes:            formData.get('notes') as string || null,
    logged_by:        user.id
  }

  const { error } = await supabase.from('payments').insert(payload)
  if (error) return { error: error.message }
  
  revalidatePath(`/dashboard/sales/${invoiceId}`)
  revalidatePath('/dashboard/sales')
  return { success: true }
}

// ── Helpers ─────────────────────────────────────────────────
export async function getAvailableDeals() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('deals')
    .select(`
      id, deal_number, model, storage, grade, quantity,
      items:deal_items(*),
      invoice_line_items(deal_id, deal_item_id, quantity, invoices!inner(status))
    `)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching available deals:', error)
    return []
  }

  // Calculate remaining quantities
  return (data || []).map((deal: any) => {
    // Only count active invoices (not cancelled/voided)
    const activeLineItems = (deal.invoice_line_items || []).filter((li: any) => 
      li.invoices?.status !== 'CANCELLED' && li.invoices?.status !== 'VOIDED'
    )
    
    // Total allocated across ALL line items (deal-level + SKU-level)
    const totalAllocated = activeLineItems
      .reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)
    
    // Deal header remaining = total deal quantity minus everything sold
    deal.remaining_quantity = Math.max(0, (deal.quantity || 0) - totalAllocated)

    // For deal items (SKUs)
    if (deal.items && deal.items.length > 0) {
      // Unattributed quantity (deal_item_id = null) — happens for legacy or whole-deal selections
      const unattributedAllocated = activeLineItems
        .filter((li: any) => !li.deal_item_id)
        .reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)

      deal.items = deal.items.map((item: any) => {
        const itemAllocated = activeLineItems
          .filter((li: any) => li.deal_item_id === item.id)
          .reduce((sum: number, li: any) => sum + (li.quantity || 0), 0)

        let remaining = Math.max(0, (item.quantity || 0) - itemAllocated)

        // For single-item deals, unattributed deal-level sales also consume this SKU's stock
        if (deal.items.length === 1) {
          remaining = Math.max(0, remaining - unattributedAllocated)
        }
        
        return {
          ...item,
          remaining_quantity: remaining
        }
      })
    }

    return deal
  })
}

// ── Approvals ───────────────────────────────────────────────
export async function getPendingInvoices() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('approval_status', 'PENDING_APPROVAL')
    .order('created_at', { ascending: false })
    
  if (error) {
    console.error('Error fetching pending invoices:', error)
    return []
  }
  return data || []
}

export async function updateInvoiceApproval(id: string, status: 'APPROVED' | 'REJECTED') {
  const supabase = await createClient()
  const { error } = await supabase
    .from('invoices')
    .update({ approval_status: status })
    .eq('id', id)
    
  if (error) throw error
  revalidatePath('/dashboard/admin')
  revalidatePath('/dashboard/sales')
}

export async function updateInvoiceBilledTo(
  id: string,
  customerName: string,
  customerAddress: string,
  customerEmail: string,
  customerPhone: string
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('invoices')
    .update({
      customer_name: customerName,
      customer_address: customerAddress || null,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null
    })
    .eq('id', id)
    
  if (error) throw error
  revalidatePath('/dashboard/sales')
  revalidatePath(`/dashboard/sales/${id}`)
}
