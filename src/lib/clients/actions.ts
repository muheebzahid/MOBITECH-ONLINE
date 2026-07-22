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
    console.error('getClientById error:', error)
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
