import { getDeals } from '@/lib/deals/actions'
import { getTreasurySettings } from '@/lib/finance/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import DealsClient from './DealsClient'

export const dynamic = 'force-dynamic'

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const role = await getUserRole()
  if (role === 'SALES' || role === 'LOGISTICS') redirect('/dashboard')
  const resolvedParams = await searchParams
  const page = Math.max(0, parseInt(resolvedParams?.page || '0') || 0)

  const [dealsRes, settings] = await Promise.all([
    getDeals(page),
    getTreasurySettings()
  ])
  
  return <DealsClient deals={dealsRes.data || []} total={dealsRes.total} page={page} settings={settings || { amex_limit: 500000, cash_limit: 300000 }} />
}
