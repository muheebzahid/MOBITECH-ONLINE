import { getDeals } from '@/lib/deals/actions'
import { getTreasurySettings } from '@/lib/finance/actions'
import { getUserRole } from '@/lib/admin/actions'
import { redirect } from 'next/navigation'
import DealsClient from './DealsClient'

export const dynamic = 'force-dynamic'

export default async function DealsPage() {
  const role = await getUserRole()
  if (role === 'SALES' || role === 'LOGISTICS') redirect('/dashboard')
  const deals = await getDeals()
  const settings = await getTreasurySettings()
  
  return <DealsClient deals={deals || []} settings={settings || { amex_limit: 500000, cash_limit: 300000 }} />
}
