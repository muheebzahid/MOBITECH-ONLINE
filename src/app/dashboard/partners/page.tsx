import { getFinancialSummary } from '@/lib/accounting/actions'
import { getPartners, getPendingWithdrawals, getPartnerTransactions } from '@/lib/partners/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import PartnersClient from './PartnersClient'

export const dynamic = 'force-dynamic'

export default async function PartnersPage() {
  const role = await getUserRole()
  if (role === 'LOGISTICS' || role === 'SALES') redirect('/dashboard')
  const summary = await getFinancialSummary()
  const partners = await getPartners()
  const pendingWithdrawals = await getPendingWithdrawals()
  const transactions = await getPartnerTransactions()
  
  return (
    <PartnersClient 
      netProfit={summary.usd.netProfit} 
      partners={partners || []} 
      pendingWithdrawals={pendingWithdrawals || []} 
      transactions={transactions || []}
    />
  )
}
