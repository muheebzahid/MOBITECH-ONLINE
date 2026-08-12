import { getTreasurySettings, getWireTransfers, getRepayments, getTreasuryData } from '@/lib/finance/actions'
import { getTreasuryTransactions } from '@/lib/accounting/treasuryActions'
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
  
  const { deals, invoices } = await getTreasuryData()
  const treasuryTransactions = await getTreasuryTransactions()
  
  return (
    <FinanceClient 
      settings={settings || { amex_limit: 500000, turbo_cash_limit: 300000, sb_cash_limit: 0 }} 
      wires={wires || []} 
      repayments={repayments || []} 
      deals={deals || []}
      invoices={invoices || []}
      userRole={role || undefined}
      treasuryTransactions={treasuryTransactions || []}
    />
  )
}
