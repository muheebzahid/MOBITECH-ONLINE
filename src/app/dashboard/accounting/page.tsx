import { getFinancialSummary } from '@/lib/accounting/actions'
import { getTreasuryTransactions } from '@/lib/accounting/treasuryActions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import AccountingClient from './AccountingClient'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ statement_date?: string, from_date?: string, to_date?: string }> }) {
  const params = await searchParams
  const role = await getUserRole()
  if (role === 'LOGISTICS' || role === 'SALES') redirect('/dashboard')
  
  const supabase = await createClient()
  const [
    { data: datesData },
    summary,
    treasuryTransactions
  ] = await Promise.all([
    supabase.from('deals').select('amex_statement_date').not('amex_statement_date', 'is', null),
    getFinancialSummary(params.statement_date, params.from_date, params.to_date),
    getTreasuryTransactions()
  ])
  
  const statementDates = [...new Set((datesData || []).map(d => d.amex_statement_date).filter(Boolean))].sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())
  
  return (
    <AccountingClient 
      summary={summary} 
      expenseHistory={summary.expenseHistory} 
      partners={summary.partners || []}
      partnerTransactions={summary.partnerTransactions || []}
      treasuryTransactions={treasuryTransactions}
      statementDates={statementDates}
      selectedStatementDate={params.statement_date}
      fromDate={params.from_date}
      toDate={params.to_date}
      userRole={role || undefined}
    />
  )
}
