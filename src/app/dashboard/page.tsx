import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardHomeClient from './DashboardHomeClient'
import { getFinancialSummary } from '@/lib/accounting/actions'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // 1. Fetch treasury settings
  let settings = { amex_limit: 500000, cash_limit: 300000 }
  const { data: settingsData } = await supabase.from('treasury_settings').select('*').single()
  if (settingsData) {
    settings = {
      amex_limit: Number(settingsData.amex_limit) || 500000,
      cash_limit: Number(settingsData.cash_limit) || 300000,
    }
  }

  // 2. Fetch deals
  const { data: deals } = await supabase.from('deals').select('*').order('created_at', { ascending: false })

  // 3. Fetch outstanding A/R
  const { data: invoices } = await supabase.from('invoices').select('total_amount, amount_paid').neq('status', 'CANCELLED')
  const outstandingAR = invoices ? invoices.reduce((sum, inv) => sum + (Number(inv.total_amount) - Number(inv.amount_paid || 0)), 0) : 0

  // 4. Fetch financial summary
  const summary = await getFinancialSummary()

  // 5. Fetch inventory count summary
  const { data: inventoryItems } = await supabase.from('inventory_items').select('model, grade, status, total_cost')
  
  return (
    <DashboardHomeClient 
      deals={deals || []} 
      settings={settings}
      outstandingAR={outstandingAR}
      summary={summary}
      inventoryItems={inventoryItems || []}
    />
  )
}
