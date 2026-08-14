'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getUserRole } from '@/lib/admin/actions'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { cache } from 'react'

export const getTreasurySettings = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('treasury_settings')
    .select('*')
    .limit(1)
    .single()
    
  if (error) {
    console.error('Error fetching treasury settings:', error)
    return { amex_limit: 500000, turbo_cash_limit: 150000, sb_cash_limit: 150000 }
  }
  return data
})

export async function updateTreasurySettings(amexLimit: number, turboLimit: number, sbLimit: number) {
  const supabase = await createClient()
  
  // We just update the first row
  const { data: settings } = await supabase.from('treasury_settings').select('id').limit(1).single()
  
  if (settings) {
    const { error } = await supabase
      .from('treasury_settings')
      .update({ amex_limit: amexLimit, turbo_cash_limit: turboLimit, sb_cash_limit: sbLimit })
      .eq('id', settings.id)
      
    if (error) throw error
  }
  
  revalidatePath('/dashboard/finance')
  revalidatePath('/dashboard/deals')
}

export async function getWireTransfers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('wire_transfers')
    .select('*, deals(deal_number)')
    .order('created_at', { ascending: false })
    
  if (error) {
    console.error('Error fetching wire transfers:', error)
    return []
  }
  return data
}

export async function logWireTransfer(dealId: string | null, amount: number, destination: string, notes?: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { error } = await supabase
    .from('wire_transfers')
    .insert({
      deal_id: dealId || null,
      amount,
      destination,
      notes,
      logged_by: user?.id
    })
    
  if (error) throw error
  revalidatePath('/dashboard/finance')
}

export async function getRepayments() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('repayments')
    .select('*')
    .order('created_at', { ascending: false })
    
  if (error) {
    console.error('Error fetching repayments:', error)
    return []
  }
  return data
}

export async function logRepayment(amount: number, source: 'AMEX' | 'CASH_POOL' | 'AMEX_PAYOFF_SB' | 'TURBO_CASH' | 'SB_CASH' | 'TURBO_TO_SB' | 'SB_TO_TURBO' | 'TURBO_TO_AMEX', notes?: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { error } = await supabase
    .from('repayments')
    .insert({
      amount,
      source,
      notes,
      logged_by: user?.id
    })
    
  if (error) throw error

  // Amex Cashback Locking Logic
  if (source === 'AMEX_PAYOFF_SB' || source === 'AMEX') {
    // Find active deals funded by Amex that don't have cashback secured yet
    const { data: amexDeals } = await supabase
      .from('deals')
      .select('id, cashback_received')
      .in('funding_source', ['AMEX', 'MIXED'])
      .neq('status', 'DEAL_CLOSED')
      .is('cashback_received', false)

    if (amexDeals && amexDeals.length > 0) {
      const dealIds = amexDeals.map(d => d.id)
      await supabase
        .from('deals')
        .update({ cashback_received: true })
        .in('id', dealIds)
    }
  }

  revalidatePath('/dashboard/finance')
}

export async function updateWireTransfer(id: string, amount: number, destination: string, notes?: string, dealId?: string | null) {
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') throw new Error('Unauthorized')
  
  const supabaseAdmin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await supabaseAdmin
    .from('wire_transfers')
    .update({ amount, destination, notes, deal_id: dealId || null })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/finance')
}

export async function deleteWireTransfer(id: string) {
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') throw new Error('Unauthorized')

  const supabaseAdmin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await supabaseAdmin.from('wire_transfers').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/finance')
}

export async function updateRepayment(id: string, amount: number, source: 'AMEX' | 'CASH_POOL' | 'AMEX_PAYOFF_SB' | 'TURBO_CASH' | 'SB_CASH' | 'TURBO_TO_SB' | 'SB_TO_TURBO' | 'TURBO_TO_AMEX', notes?: string) {
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN' && role !== 'FINANCE') throw new Error('Unauthorized')

  const supabaseAdmin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await supabaseAdmin
    .from('repayments')
    .update({ amount, source, notes })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/finance')
}

export async function deleteRepayment(id: string) {
  const role = await getUserRole()
  if (role !== 'SUPER_ADMIN') throw new Error('Unauthorized')

  const supabaseAdmin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await supabaseAdmin.from('repayments').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/finance')
}

export async function getTreasuryData() {
  const supabase = await createClient()
  
  const [{ data: deals }, { data: invoices }, { data: expenses }] = await Promise.all([
    supabase.from('deals').select(`
      *,
      shipment_deals (
        shipments (
          total_logistics_cost,
          shipment_deals ( deals ( quantity ) )
        )
      )
    `),
    supabase.from('invoices')
      .select('*, invoice_line_items(*, deal_items(unit_cost)), clients(name)')
      .eq('status', 'PAID'),
    supabase.from('operating_expenses').select('*')
  ])
    
  return {
    deals: deals || [],
    invoices: invoices || [],
    expenses: expenses || []
  }
}

