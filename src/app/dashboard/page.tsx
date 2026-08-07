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

  let settings = { amex_limit: 500000, cash_limit: 300000 }
  
  const [
    { data: settingsData },
    { data: deals },
    { data: invoices },
    summary,
    { data: inventoryItems }
  ] = await Promise.all([
    supabase.from('treasury_settings').select('*').single(),
    supabase.from('deals').select('*').order('created_at', { ascending: false }),
    supabase.from('invoices').select('total_amount, amount_paid').neq('status', 'CANCELLED'),
    getFinancialSummary(),
    supabase.from('inventory_items').select('model, grade, status, total_cost')
  ])

  if (settingsData) {
    settings = {
      amex_limit: Number(settingsData.amex_limit) || 500000,
      cash_limit: Number(settingsData.cash_limit) || 300000,
    }
  }

  const outstandingAR = invoices ? invoices.reduce((sum, inv) => sum + (Number(inv.total_amount) - Number(inv.amount_paid || 0)), 0) : 0

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
