'use server' // Server action marker

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface TreasuryTransaction {
  id: string
  month_cycle: string
  transaction_type: 'TURBO_TO_SB' | 'SB_TO_AMEX' | string
  source_account: string
  destination_account: string
  amount: number
  transaction_date: string
  status: string
  reference_notes: string | null
  deal_ids: string[]
  logged_by?: string | null
  created_at: string
  updated_at: string
}

export async function getTreasuryTransactions(): Promise<TreasuryTransaction[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('treasury_transactions')
      .select('*')
      .order('transaction_date', { ascending: false })

    if (error) {
      // Return empty array if table doesn't exist yet
      console.warn('getTreasuryTransactions warning:', error.message)
      return []
    }
    return (data || []).map(row => ({
      ...row,
      amount: Number(row.amount || 0),
      deal_ids: Array.isArray(row.deal_ids) ? row.deal_ids : []
    }))
  } catch (err) {
    console.error('getTreasuryTransactions error:', err)
    return []
  }
}

export async function autoGenerateTreasuryEntriesFromDeals() {
  try {
    const supabase = await createClient()

    // 1. Fetch all AMEX-funded deals with payment_date
    const { data: deals, error: dealsErr } = await supabase
      .from('deals')
      .select('id, deal_number, supplier, funding_source, amex_amount, cash_amount, total_commitment, payment_date, amex_statement_date, created_at')

    if (dealsErr) {
      throw new Error('Failed to fetch deals: ' + dealsErr.message)
    }

    if (!deals || deals.length === 0) {
      return { success: true, count: 0, message: 'No deals found in database' }
    }

    // 2. Helper: determine the AMEX payoff month cycle for a given payment_date
    //
    // BUSINESS RULE:
    //   • If deal payment_date day is 1–11  → AMEX payoff happens in the SAME month
    //   • If deal payment_date day is 12–31 → AMEX payoff happens in the NEXT month
    //
    // Example:
    //   June 10 → payoff cycle = 2026-06 (entries: June 10th & June 11th)
    //   June 13 → payoff cycle = 2026-07 (entries: July 10th & July 11th)
    function getPayoffMonthCycle(rawDate: string): string {
      const date = new Date(rawDate)
      const day = date.getUTCDate()

      if (day < 12) {
        // Same month — format as YYYY-MM
        const year = date.getUTCFullYear()
        const month = String(date.getUTCMonth() + 1).padStart(2, '0')
        return `${year}-${month}`
      } else {
        // Next month
        const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
        const year = nextMonth.getUTCFullYear()
        const month = String(nextMonth.getUTCMonth() + 1).padStart(2, '0')
        return `${year}-${month}`
      }
    }

    // 3. Group deals by payoff month cycle
    const payoffGroups: Record<string, { totalAmex: number; deals: any[]; dealDates: string[] }> = {}

    deals.forEach(deal => {
      // Only process AMEX-funded deals
      const amexVal = Number(
        deal.amex_amount ||
        (deal.funding_source === 'AMEX' ? deal.total_commitment : 0) ||
        (deal.funding_source === 'MIXED' ? Number(deal.total_commitment) / 2 : 0) ||
        0
      )
      if (amexVal <= 0) return

      const rawDate = deal.payment_date || deal.amex_statement_date || deal.created_at
      if (!rawDate) return

      const payoffCycle = getPayoffMonthCycle(rawDate)

      if (!payoffGroups[payoffCycle]) {
        payoffGroups[payoffCycle] = { totalAmex: 0, deals: [], dealDates: [] }
      }

      payoffGroups[payoffCycle].totalAmex += amexVal
      payoffGroups[payoffCycle].deals.push(deal)
      payoffGroups[payoffCycle].dealDates.push(rawDate.slice(0, 10))
    })

    if (Object.keys(payoffGroups).length === 0) {
      return { success: true, count: 0, message: 'No AMEX funded deals found to generate entries' }
    }

    // 4. Build single entries for each payoff month cycle
    const entriesToUpsert: any[] = []

    Object.entries(payoffGroups).forEach(([payoffCycle, data]) => {
      if (data.totalAmex <= 0) return

      const dealCount = data.deals.length
      const dealIds = data.deals.map(d => d.id)
      const dealNumbers = data.deals.map(d => d.deal_number).join(', ')

      // Rule 1: Turbo Pool → SB Pool by 10th of payoff month
      const entry10th = {
        month_cycle: payoffCycle,
        transaction_type: 'TURBO_TO_SB',
        source_account: 'TURBO_POOL',
        destination_account: 'SB_POOL',
        amount: data.totalAmex,
        transaction_date: `${payoffCycle}-10`,
        status: 'COMPLETED',
        reference_notes: `Rule 1: Turbo → SB Cash Transfer for ${payoffCycle} AMEX Settlement. Deals: ${dealNumbers} (${dealCount} deal${dealCount > 1 ? 's' : ''})`,
        deal_ids: dealIds,
        updated_at: new Date().toISOString()
      }

      // Rule 2: SB Pool → AMEX Payoff by 11th of payoff month
      const entry11th = {
        month_cycle: payoffCycle,
        transaction_type: 'SB_TO_AMEX',
        source_account: 'SB_POOL',
        destination_account: 'AMEX_CARD',
        amount: data.totalAmex,
        transaction_date: `${payoffCycle}-11`,
        status: 'COMPLETED',
        reference_notes: `Rule 2: SB Pool → AMEX Payoff for ${payoffCycle} Statement. Deals: ${dealNumbers} (${dealCount} deal${dealCount > 1 ? 's' : ''})`,
        deal_ids: dealIds,
        updated_at: new Date().toISOString()
      }

      entriesToUpsert.push(entry10th, entry11th)
    })

    // 5. First clear ALL existing auto-generated entries so we get a clean slate
    await supabase.from('treasury_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // 6. Insert fresh corrected entries
    const { error: insertErr } = await supabase
      .from('treasury_transactions')
      .insert(entriesToUpsert)

    if (insertErr) {
      throw new Error('Failed to insert treasury entries: ' + insertErr.message)
    }

    revalidatePath('/dashboard/accounting')
    revalidatePath('/dashboard/finance')
    return {
      success: true,
      count: entriesToUpsert.length,
      monthly_cycles: Object.keys(payoffGroups).length,
      cycles_detail: Object.entries(payoffGroups).map(([cycle, d]) => ({
        payoff_cycle: cycle,
        deals: d.deals.map(deal => deal.deal_number),
        total_amex: d.totalAmex,
        payment_dates: d.dealDates
      })),
      message: `Generated ${entriesToUpsert.length} treasury entries across ${Object.keys(payoffGroups).length} payoff cycles using cutoff-date rule (day < 12 = same month, day >= 12 = next month)`
    }
  } catch (err: any) {
    console.error('autoGenerateTreasuryEntriesFromDeals error:', err)
    return { success: false, error: err.message || 'Auto-generation failed' }
  }
}


export async function recordTreasuryTransaction(data: {
  id?: string
  month_cycle: string
  transaction_type: 'TURBO_TO_SB' | 'SB_TO_AMEX'
  amount: number
  transaction_date: string
  reference_notes?: string
  deal_ids?: string[]
}) {
  try {
    const supabase = await createClient()

    const payload = {
      month_cycle: data.month_cycle,
      transaction_type: data.transaction_type,
      source_account: data.transaction_type === 'TURBO_TO_SB' ? 'TURBO_POOL' : 'SB_POOL',
      destination_account: data.transaction_type === 'TURBO_TO_SB' ? 'SB_POOL' : 'AMEX_CARD',
      amount: data.amount,
      transaction_date: data.transaction_date,
      status: 'COMPLETED',
      reference_notes: data.reference_notes || '',
      deal_ids: data.deal_ids || [],
      updated_at: new Date().toISOString()
    }

    let error
    if (data.id) {
      const res = await supabase.from('treasury_transactions').update(payload).eq('id', data.id)
      error = res.error
    } else {
      const res = await supabase.from('treasury_transactions').insert(payload)
      error = res.error
    }

    if (error) {
      throw new Error(error.message)
    }

    revalidatePath('/dashboard/accounting')
    return { success: true }
  } catch (err: any) {
    console.error('recordTreasuryTransaction error:', err)
    return { success: false, error: err.message || 'Failed to record entry' }
  }
}

export async function deleteTreasuryTransaction(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('treasury_transactions').delete().eq('id', id)
    if (error) throw new Error(error.message)

    revalidatePath('/dashboard/accounting')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete transaction' }
  }
}
