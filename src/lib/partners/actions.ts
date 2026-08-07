'use server'
import { requireWriteAccess } from '@/lib/admin/actions'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getPartners() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .order('name', { ascending: true })
    
  if (error) {
    console.error('Error fetching partners:', error)
    return []
  }
  return data
}

export async function getPartnerTransactions(partnerId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('partner_transactions')
    .select('*, partners(name)')
    .order('created_at', { ascending: false })
    
  if (partnerId) {
    query = query.eq('partner_id', partnerId)
  }
  
  const { data, error } = await query
  if (error) {
    console.error('Error fetching partner transactions:', error)
    return []
  }
  return data
}

export async function getPendingWithdrawals() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('partner_transactions')
    .select('*, partners(name)')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
    
  if (error) {
    console.error('Error fetching pending withdrawals:', error)
    return []
  }
  return data
}

export async function requestWithdrawal(partnerId: string, amount: number, notes?: string) {
  await requireWriteAccess();

  await requireWriteAccess();

  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { error } = await supabase
    .from('partner_transactions')
    .insert({
      partner_id: partnerId,
      type: 'WITHDRAWAL',
      amount,
      status: 'PENDING',
      notes: notes || 'Withdrawal request',
      requested_by: user?.id
    })
    
  if (error) throw error
  revalidatePath('/dashboard/partners')
}

export async function approveTransaction(transactionId: string) {
  await requireWriteAccess();

  await requireWriteAccess();

  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { error } = await supabase
    .from('partner_transactions')
    .update({
      status: 'APPROVED',
      resolved_by: user?.id
    })
    .eq('id', transactionId)
    
  if (error) throw error
  revalidatePath('/dashboard/partners')
}

export async function rejectTransaction(transactionId: string) {
  await requireWriteAccess();

  await requireWriteAccess();

  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { error } = await supabase
    .from('partner_transactions')
    .update({
      status: 'REJECTED',
      resolved_by: user?.id
    })
    .eq('id', transactionId)
    
  if (error) throw error
  revalidatePath('/dashboard/partners')
}

export async function distributeProfit(amount: number) {
  await requireWriteAccess();

  await requireWriteAccess();

  const supabase = await createClient()
  
  // Get partners
  const { data: partners, error: pError } = await supabase
    .from('partners')
    .select('id, equity_share')
    
  if (pError) throw pError
  
  // Calculate shares and create transactions
  const { data: { user } } = await supabase.auth.getUser()
  
  const transactions = partners.map(p => {
    // Note: We use the equity_share from the database to calculate exact amounts
    const shareAmount = Number(((amount * Number(p.equity_share)) / 100).toFixed(2))
    return {
      partner_id: p.id,
      type: 'PROFIT_SHARE',
      amount: shareAmount,
      status: 'APPROVED',
      notes: `Manual profit distribution of total $${amount.toLocaleString()}`,
      requested_by: user?.id,
      resolved_by: user?.id
    }
  })
  
  const { error } = await supabase
    .from('partner_transactions')
    .insert(transactions)
    
  if (error) throw error
  revalidatePath('/dashboard/partners')
}

export async function injectCapital(partnerId: string, amount: number, notes?: string) {
  await requireWriteAccess();

  await requireWriteAccess();

  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  const { error } = await supabase
    .from('partner_transactions')
    .insert({
      partner_id: partnerId,
      type: 'CAPITAL_INJECTION',
      amount,
      status: 'APPROVED', // Capital injections don't need approval process for now
      notes: notes || 'Capital Injection',
      requested_by: user?.id,
      resolved_by: user?.id
    })
    
  if (error) throw error
  revalidatePath('/dashboard/partners')
}
