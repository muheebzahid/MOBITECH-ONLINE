import { getTreasurySettings, getWireTransfers, getRepayments } from '@/lib/finance/actions'
import { getDeals } from '@/lib/deals/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import FinanceClient from './FinanceClient'

export const dynamic = 'force-dynamic'

export default async function FinancePage() {
  const role = await getUserRole()
  if (role === 'LOGISTICS' || role === 'SALES') redirect('/dashboard')
  const settings = await getTreasurySettings()
  const wires = await getWireTransfers()
  const repayments = await getRepayments()
  const deals = await getDeals() // We need deals to calculate what is currently stuck vs what is available
  
  return (
    <FinanceClient 
      settings={settings || { amex_limit: 500000, cash_limit: 300000 }} 
      wires={wires || []} 
      repayments={repayments || []} 
      deals={deals || []}
    />
  )
}
