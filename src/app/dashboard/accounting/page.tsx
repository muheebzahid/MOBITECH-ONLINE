import { getFinancialSummary } from '@/lib/accounting/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import AccountingClient from './AccountingClient'

export const dynamic = 'force-dynamic'

export default async function AccountingPage() {
  const role = await getUserRole()
  if (role === 'LOGISTICS' || role === 'SALES') redirect('/dashboard')
  const summary = await getFinancialSummary()
  
  return <AccountingClient summary={summary} expenseHistory={summary.expenseHistory} />
}
