'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getTreasurySettings() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('treasury_settings')
    .select('*')
    .limit(1)
    .single()
    
  if (error) {
    console.error('Error fetching treasury settings:', error)
    return { amex_limit: 500000, cash_limit: 300000 }
  }
  return data
}

export async function updateTreasurySettings(amexLimit: number, cashLimit: number) {
  const supabase = await createClient()
  
  // We just update the first row
  const { data: settings } = await supabase.from('treasury_settings').select('id').limit(1).single()
  
  if (settings) {
    const { error } = await supabase
      .from('treasury_settings')
      .update({ amex_limit: amexLimit, cash_limit: cashLimit })
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

export async function logRepayment(amount: number, source: 'AMEX' | 'CASH_POOL', notes?: string) {
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
  revalidatePath('/dashboard/finance')
}

export async function updateWireTransfer(id: string, amount: number, destination: string, notes?: string, dealId?: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('wire_transfers')
    .update({ amount, destination, notes, deal_id: dealId || null })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/finance')
}

export async function deleteWireTransfer(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('wire_transfers').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/finance')
}

export async function updateRepayment(id: string, amount: number, source: 'AMEX' | 'CASH_POOL', notes?: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('repayments')
    .update({ amount, source, notes })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/finance')
}

export async function deleteRepayment(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('repayments').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard/finance')
}

