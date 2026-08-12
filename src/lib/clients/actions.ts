'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getClients() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: clients, error } = await supabase
    .from('clients')
    .select(`
      *,
      invoices(*)
    `)
    .order('name', { ascending: true })

  if (error) {
    console.error('getClients error:', error)
    return []
  }

  // Aggregate stats per client
  return (clients || []).map(client => {
    const activeInvoices = (client.invoices || []).filter((inv: any) => inv.status !== 'CANCELLED')
    const totalBilled = activeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0)
    const totalPaid = activeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.amount_paid || 0), 0)
    const totalOutstanding = activeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.balance_due || 0), 0)
    
    return {
      ...client,
      total_billed: totalBilled,
      total_paid: totalPaid,
      total_outstanding: totalOutstanding,
      invoices_count: activeInvoices.length
    }
  })
}

export async function getClientById(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: client, error } = await supabase
    .from('clients')
    .select(`
      *,
      invoices(*, invoice_line_items(quantity))
    `)
    .eq('id', id)
    .single()

  if (error || !client) {
    if (error && error.code !== 'PGRST116') {
      console.error('getClientById error:', error)
    }
    return null
  }

  const activeInvoices = (client.invoices || []).filter((inv: any) => inv.status !== 'CANCELLED')
  const totalBilled = activeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.total_amount || 0), 0)
  const totalPaid = activeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.amount_paid || 0), 0)
  const totalOutstanding = activeInvoices.reduce((sum: number, inv: any) => sum + Number(inv.balance_due || 0), 0)

  // Sort invoices desc
  const sortedInvoices = [...(client.invoices || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return {
    ...client,
    invoices: sortedInvoices,
    total_billed: totalBilled,
    total_paid: totalPaid,
    total_outstanding: totalOutstanding,
    invoices_count: activeInvoices.length
  }
}

export async function getClientImpactAnalysis(clientId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // 1. Fetch Client Details
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single()

  if (!client) return { error: 'Client account not found' }

  // 2. Fetch Linked Invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total_amount, balance_due, amount_paid, issue_date, created_at')
    .eq('client_id', clientId)

  const invList = invoices || []
  const invIds = invList.map(i => i.id)

  // 3. Fetch Linked Deals via line items
  let deals: any[] = []
  if (invIds.length > 0) {
    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('deal_id, deals(id, deal_number, model, supplier, status, total_commitment)')
      .in('invoice_id', invIds)

    const dealMap = new Map<string, any>()
    for (const item of (lineItems || [])) {
      const d: any = Array.isArray(item.deals) ? item.deals[0] : item.deals
      if (d && d.id) {
        dealMap.set(d.id, d)
      }
    }
    deals = Array.from(dealMap.values())
  }

  // 4. Fetch Other Available Client Accounts for Reassignment
  const { data: otherClients } = await supabase
    .from('clients')
    .select('id, name, email, phone')
    .neq('id', clientId)
    .order('name', { ascending: true })

  return {
    success: true,
    client,
    invoices: invList,
    deals,
    availableClients: otherClients || []
  }
}

export async function deleteClientAccount(clientId: string, targetClientId?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Check linked invoices
  const { data: linkedInvoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('client_id', clientId)

  if (linkedInvoices && linkedInvoices.length > 0) {
    if (!targetClientId) {
      return { error: 'Deletion blocked: This client account has active invoices. You must select a destination client account to transfer all invoices before deleting.' }
    }

    // Get target client details
    const { data: targetClient } = await supabase
      .from('clients')
      .select('*')
      .eq('id', targetClientId)
      .single()

    if (!targetClient) {
      return { error: 'Selected destination client account was not found.' }
    }

    // Transfer all invoices to target client
    const { error: transferError } = await supabase
      .from('invoices')
      .update({
        client_id: targetClientId,
        customer_name: targetClient.name,
        customer_email: targetClient.email || null,
        customer_phone: targetClient.phone || null,
        customer_address: targetClient.address || null
      })
      .eq('client_id', clientId)

    if (transferError) {
      return { error: 'Failed to transfer invoices: ' + transferError.message }
    }
  }

  // Delete Client Account Record
  const { error: deleteError } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId)

  if (deleteError) {
    return { error: 'Failed to delete client account: ' + deleteError.message }
  }

  revalidatePath('/dashboard/clients')
  revalidatePath('/dashboard/sales')
  return { success: true }
}
